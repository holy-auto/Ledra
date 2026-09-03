/**
 * POST /api/admin/purchase-orders/ai-message
 * 発注書 (purchase_order) を仕入先/供給パートナーへ送る発注依頼メールの AI 下書き生成。
 * minPlan: standard (ai_draft)
 *
 * 壁3: 数量・金額は発注書に確定済みのものを使うだけ。AI は文面のみ生成。
 * 送信は別操作 (人が確認して PUT で sent) で行う。ここでは draft 文面を返すだけ。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiOk,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { fastModelForPlanTier } from "@/lib/ai/client";
import {
  generatePurchaseOrderMessage,
  buildFallbackPurchaseOrderMessage,
  type PurchaseOrderMessageInput,
} from "@/lib/ai/draftPurchaseOrderMessage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({ po_id: z.string().uuid("無効な発注IDです。") });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_draft")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", { code: "plan_limit" });
    }

    // 発注メッセージ生成は呼ぶたびに AI 費用が出る。
    // プラン判定より後に置く。Free のテナントには 429 ではなく案内を返したい。
    const limited = await checkRateLimit(req, "ai", `po-ai-message:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { po_id } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 発注書 + 明細 (所有チェック込み)。
    const { data: po, error: poErr } = await admin
      .from("purchase_orders")
      .select(
        "id, po_number, note, subtotal, supplier_id, supply_partner_id, purchase_order_items(name, sku, quantity, unit_cost)",
      )
      .eq("id", po_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (poErr) return apiInternalError(poErr, "po ai-message fetch");
    if (!po) return apiNotFound("purchase order not found");

    // 仕入先名 / 希望納期: テナントローカル仕入先 (suppliers) を優先、無ければ
    // 供給パートナー (supply_partners) を参照。どちらも無ければ既定文言。
    let supplierName = "ご担当者";
    let leadTimeDays: number | null = null;
    if (po.supplier_id) {
      const { data: s } = await admin
        .from("suppliers")
        .select("name, lead_time_days")
        .eq("id", po.supplier_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (s?.name) supplierName = s.name as string;
      leadTimeDays = (s?.lead_time_days as number | null) ?? null;
    } else if (po.supply_partner_id) {
      // supply_partners は platform スコープ (owner専用RLS) だが、ここは確定済み発注の
      // 宛名表示に名前が要るだけ。tenant_supply_links で自店が提携している相手に限定する。
      const { data: link } = await admin
        .from("tenant_supply_links")
        .select("supply_partner_id")
        .eq("tenant_id", caller.tenantId)
        .eq("supply_partner_id", po.supply_partner_id)
        .maybeSingle();
      if (link) {
        const { data: sp } = await admin
          .from("supply_partners")
          .select("name")
          .eq("id", po.supply_partner_id)
          .maybeSingle();
        if (sp?.name) supplierName = sp.name as string;
      }
    }

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", caller.tenantId).maybeSingle();
    const shopName = (tenant?.name as string | null) ?? "当店";

    const items = (po.purchase_order_items ?? []) as Array<{
      name: string;
      sku: string | null;
      quantity: number;
      unit_cost: number | null;
    }>;

    const input: PurchaseOrderMessageInput = {
      shopName,
      supplierName,
      poNumber: (po.po_number as string | null) ?? po.id,
      items: items.map((l) => ({
        name: l.name,
        sku: l.sku,
        quantity: Number(l.quantity),
        unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
      })),
      subtotal: Number(po.subtotal ?? 0),
      note: (po.note as string | null) ?? null,
      desiredLeadTimeDays: leadTimeDays,
    };

    // テナント設定で AI が OFF ならモデルを呼ばず、決定論フォールバック文面を返す。
    const automation = await loadAiAutomationSettings(caller.tenantId);
    const message = automation.enabled
      ? await generatePurchaseOrderMessage(input, { model: fastModelForPlanTier(caller.planTier) })
      : buildFallbackPurchaseOrderMessage(input);

    return apiOk({
      message: { subject: message.subject, body: message.body },
      ai_used: automation.enabled && !message.fallback,
      ai_disabled: !automation.enabled,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "po ai-message");
  }
}
