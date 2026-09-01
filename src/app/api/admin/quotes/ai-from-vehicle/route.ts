/**
 * POST /api/admin/quotes/ai-from-vehicle
 *
 * 車両 ID + サービスカテゴリ (任意で顧客 ID / 基本メニュー) を受け取り、
 * 過去類似請求書を基に見積書 (documents.doc_type='estimate') の下書きを返す。
 *
 * 既存の見積書作成 UI が無いため、payload はクライアントが
 * /admin/documents/new などに流し込んで使うことを想定 (items / total /
 * validity_days / terms)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateQuoteFromVehicle, extractInvoiceLines } from "@/lib/ai/quoteFromVehicle";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  vehicle_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  service_category: z.string().trim().min(1).max(100),
  base_menu: z
    .array(z.object({ name: z.string().min(1).max(100), default_price: z.number().int().min(0).optional() }))
    .max(20)
    .optional(),
});

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/quotes/ai-from-vehicle");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_invoice_quote")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 見積書起票は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, draft: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: vehicle, error: vErr } = await admin
      .from("vehicles")
      .select("maker, model, size_class")
      .eq("id", parsed.data.vehicle_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (vErr) return apiInternalError(vErr, "quote ai-from-vehicle: vehicle");
    if (!vehicle) return apiNotFound("vehicle not found");

    const customerRes = parsed.data.customer_id
      ? await admin.from("customers").select("name").eq("id", parsed.data.customer_id).maybeSingle()
      : { data: null };
    const customer = customerRes.data as { name?: string } | null;

    // 同テナント直近 5 件の同サイズ帯請求書
    const { data: invoiceRows } = await admin
      .from("invoices")
      .select("items_json, total")
      .eq("tenant_id", tenantId)
      .order("issued_at", { ascending: false })
      .limit(20);

    const pastInvoices = (invoiceRows ?? [])
      .map((r) => extractInvoiceLines(r.items_json, r.total as number | null))
      .filter((inv) => inv.items.length > 0)
      .slice(0, 5);

    const draft = await generateQuoteFromVehicle(
      {
        vehicle,
        customerName: customer?.name ?? null,
        serviceCategory: parsed.data.service_category,
        pastInvoices,
        baseMenu: parsed.data.base_menu,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: draft.confidence,
      meta: { ai: draft.ai, items_count: draft.items.length, total: draft.total },
    });

    return apiOk({
      ai_disabled: false,
      draft: {
        doc_type: "estimate" as const,
        vehicle_id: parsed.data.vehicle_id,
        customer_id: parsed.data.customer_id ?? null,
        items: draft.items,
        total: draft.total,
        validity_days: draft.validity_days,
        terms: draft.terms,
        ai: draft.ai,
        confidence: draft.confidence,
      },
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "quote ai-from-vehicle");
  }
}
