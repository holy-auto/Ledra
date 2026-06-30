/**
 * ワークフローの「会計/請求」工程に到達した時点で、予約から請求書を
 * **status=draft の行** として自動作成する IO 層。
 *
 * 設計（certificateRecordAuto と同じ思想）:
 *   - opt-in (`invoice.auto_draft_on_billing_step`) + Standard+ (ai_invoice_quote) + is_active
 *   - 作るのは **下書きのみ**。送付（金額の外向き確定）は人（壁3）。
 *   - 冪等: 同じ顧客(+車両)の draft 請求書が既にあれば作らない（再 advance 対策）。
 *   - 金額の手掛かりが無ければ作らない（捏造しない）。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { buildTaxBreakdown, totalTax } from "@/lib/invoice/taxBreakdown";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoDraftInvoiceOnBilling, shouldAutoDraftInvoiceOnCompletion } from "./orchestrator";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

interface MenuItem {
  name?: string;
  price?: number;
  amount?: number;
  quantity?: number;
}

/** INV-YYYYMM-NNN（invoices ルートと同じ採番ルール）。 */
async function generateInvoiceNumber(admin: Admin, tenantId: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-${ym}-`;
  const { data } = await admin
    .from("documents")
    .select("doc_number")
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .like("doc_number", `${prefix}%`)
    .order("doc_number", { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const num = parseInt((data[0].doc_number as string).replace(prefix, ""), 10);
    if (!Number.isNaN(num)) seq = num + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function maybeAutoCreateDraftInvoiceForReservation(params: {
  tenantId: string;
  reservationId: string;
  /** 起動トリガ。"billing_step" = ワークフロー会計工程 / "completion" = 案件完了。各々別 opt-in。 */
  trigger?: "billing_step" | "completion";
}): Promise<void> {
  const { tenantId, reservationId, trigger = "billing_step" } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    const enabled =
      trigger === "completion"
        ? shouldAutoDraftInvoiceOnCompletion(settings)
        : shouldAutoDraftInvoiceOnBilling(settings);
    if (!enabled) return;

    const admin = createServiceRoleAdmin("AI auto-create draft invoice — workflow billing step, fire-and-forget");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return;

    const { data: reservation } = await admin
      .from("reservations")
      .select("customer_id, vehicle_id, title, menu_items_json, estimated_amount")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!reservation || !reservation.customer_id) return; // 顧客が無ければ作らない（本人確認）

    // 冪等: 同じ顧客(+車両)の draft 請求書が既にあれば作らない。
    let dupQuery = admin
      .from("documents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("doc_type", "invoice")
      .eq("status", "draft")
      .eq("customer_id", reservation.customer_id)
      .limit(1);
    if (reservation.vehicle_id) dupQuery = dupQuery.eq("vehicle_id", reservation.vehicle_id);
    const { data: existing } = await dupQuery;
    if (existing && existing.length > 0) return;

    const { data: customer } = await admin
      .from("customers")
      .select("name")
      .eq("id", reservation.customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const recipientName = ((customer?.name as string | null) ?? "").trim() || "お客様";

    // 明細: menu_items_json に金額があれば使い、無ければ estimated_amount で 1 行。
    const menu = Array.isArray(reservation.menu_items_json) ? (reservation.menu_items_json as MenuItem[]) : [];
    type Line = { name: string; quantity: number; unit_price: number; amount: number };
    let items: Line[] = [];
    for (const m of menu) {
      const unit = typeof m.price === "number" ? m.price : typeof m.amount === "number" ? m.amount : null;
      if (unit === null) continue;
      const qty = typeof m.quantity === "number" && m.quantity > 0 ? m.quantity : 1;
      const name = (typeof m.name === "string" && m.name.trim()) || "施工";
      items.push({ name, quantity: qty, unit_price: unit, amount: unit * qty });
    }
    if (items.length === 0) {
      const est = typeof reservation.estimated_amount === "number" ? reservation.estimated_amount : 0;
      if (est <= 0) return; // 金額の手掛かりが無ければ作らない
      const title = ((reservation.title as string | null) ?? "").trim() || "施工料";
      items = [{ name: title, quantity: 1, unit_price: est, amount: est }];
    }

    const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
    if (subtotal <= 0) return;
    const taxRate = 10;
    const taxBreakdown = buildTaxBreakdown(
      items.map((it) => ({ amount: it.amount, tax_rate: null })),
      taxRate,
    );
    const tax = totalTax(taxBreakdown);
    const total = subtotal + tax;
    const docNumber = await generateInvoiceNumber(admin, tenantId);

    const { error } = await admin.from("documents").insert({
      tenant_id: tenantId,
      customer_id: reservation.customer_id,
      vehicle_id: reservation.vehicle_id,
      doc_type: "invoice",
      doc_number: docNumber,
      recipient_name: recipientName,
      issued_at: new Date().toISOString().slice(0, 10),
      status: "draft",
      subtotal,
      tax,
      total,
      tax_rate: taxRate,
      items_json: items,
      tax_breakdown: taxBreakdown,
    });
    if (error) {
      logger.warn("[invoiceRecordAuto] draft invoice insert failed", { tenantId, err: error.message });
      return;
    }
    logger.info("[invoiceRecordAuto] draft invoice auto-created", { tenantId, reservationId, docNumber });
  } catch (e) {
    logger.warn("[invoiceRecordAuto] maybeAutoCreateDraftInvoiceForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
