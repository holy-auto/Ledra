/**
 * POST /api/admin/ai/enhanced-quote
 *
 * 高精度版の見積もり起票。車両 ID + 要望サービス (任意で顧客 ID) を受け取り、
 * テナント実勢価格 (pricingIntelligence) を AI に与えて見積もり明細を生成する。
 *
 * - RBAC: staff 以上。
 * - プラン: ai_invoice_quote 機能 (Standard 以上)。
 * - AI 無効テナント / 実績データ無し / AI 失敗時は基本版にフォールバック (fail-open)。
 *
 * 返り値の confidence は参照できた実勢パターン数 (patterns_used) に基づく:
 *   0 → "low", 1–3 → "medium", 4+ → "high"。
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError, apiPlanLimit } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { buildPricingContext } from "@/lib/ai/pricingIntelligence";
import { generateEnhancedQuote } from "@/lib/ai/enhancedQuote";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  vehicle_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  requested_services: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  service_category: z.string().trim().min(1).max(100).optional(),
});

function confidenceFromPatterns(n: number): "low" | "medium" | "high" {
  if (n >= 4) return "high";
  if (n >= 1) return "medium";
  return "low";
}

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/ai/enhanced-quote");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_invoice_quote")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 高精度見積もりは Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // 車両 (maker/model/year/size_class) — テナント所属を検証
    const { data: vehicle, error: vErr } = await admin
      .from("vehicles")
      .select("maker, model, year, size_class")
      .eq("id", parsed.data.vehicle_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (vErr) return apiInternalError(vErr, "enhanced-quote: vehicle");
    if (!vehicle) return apiNotFound("vehicle not found");

    // 顧客名 (任意)
    let customerName: string | null = null;
    if (parsed.data.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("name")
        .eq("id", parsed.data.customer_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      customerName = (customer?.name as string | undefined) ?? null;
    }

    // AI 無効テナント
    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, quote_lines: [], estimated_total: 0 });
    }

    // テナント実勢価格 context (1h キャッシュ)
    const pricingContext = await buildPricingContext(caller.tenantId);

    const serviceCategory = parsed.data.service_category?.trim() || parsed.data.requested_services[0] || "施工";

    const result = await generateEnhancedQuote({
      vehicle: {
        maker: (vehicle.maker as string | null) ?? null,
        model: (vehicle.model as string | null) ?? null,
        size_class: (vehicle.size_class as string | null) ?? null,
      },
      customerName,
      serviceCategory,
      pastInvoices: [],
      requestedServices: parsed.data.requested_services,
      pricingContext,
    });

    const dataFreshnessDays = Math.max(
      0,
      Math.round((Date.now() - Date.parse(pricingContext.computed_at)) / 86_400_000),
    );

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: {
        ai: result.ai,
        patterns_used: result.patterns_used,
        items_count: result.items.length,
        total: result.total,
      },
    });

    return apiOk({
      ai_disabled: false,
      quote_lines: result.items,
      estimated_total: result.total,
      validity_days: result.validity_days,
      terms: result.terms,
      ai: result.ai,
      confidence: confidenceFromPatterns(result.patterns_used),
      patterns_used: result.patterns_used,
      data_freshness_days: dataFreshnessDays,
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "enhanced-quote");
  }
}
