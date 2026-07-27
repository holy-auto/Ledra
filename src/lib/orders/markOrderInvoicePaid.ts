import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { recordInvoicePaymentBalance, type PaymentMethod } from "@/lib/invoice/recordPayment";
import { todayJst } from "@/lib/gantt/board";
import { logger } from "@/lib/logger";

/** job_orders.payment_method → payment_entries.payment_method のマップ。 */
export function mapOrderPaymentMethod(m: string | null): PaymentMethod {
  switch (m) {
    case "bank_transfer":
      return "bank_transfer";
    case "cash":
      return "cash";
    case "card":
    case "stripe_connect":
      return "credit_card";
    case "other":
      return "other";
    default:
      return "bank_transfer"; // UI 既定（未設定時）
  }
}

/**
 * 双方確認済み（＝入金確定）の受発注について、紐づく請求書 documents を「入金済」にし、
 * 売掛元帳 (payment_entries) に記帳する。請求書の発行元は受注側 (to_tenant) なので、
 * 記帳も to_tenant スコープで行う（確認者が from_tenant でも同じ）。
 *
 * 冪等: status='paid' は再更新無害、recordInvoicePaymentBalance は残高0 or 同一
 * reference_no で no-op。confirm-payment の再入（completed 状態での再POST可）でも安全。
 */
export async function markOrderInvoicePaid(orderId: string): Promise<void> {
  const supabase = createServiceRoleAdmin(
    "orders/markOrderInvoicePaid: 双方確認済の受発注請求書を入金済に (to_tenant scope)",
  );

  const { data: order } = await supabase
    .from("job_orders")
    .select("id, to_tenant_id, accepted_amount, payment_method")
    .eq("id", orderId)
    .single();
  if (!order?.to_tenant_id) return;

  const toTenantId = order.to_tenant_id as string;

  const { data: rows } = await supabase
    .from("documents")
    .select("id, status, total")
    .eq("tenant_id", toTenantId)
    .eq("job_order_id", orderId)
    .eq("doc_type", "invoice")
    .order("created_at", { ascending: true })
    .limit(1);

  const doc = rows?.[0];
  if (!doc) {
    // 合算払い等で per-order 請求書を持たない場合はスキップ（合算側で消し込む）。
    logger.info("[markOrderInvoicePaid] no per-order invoice document", { orderId });
    return;
  }

  const today = todayJst(new Date());

  if (doc.status !== "paid") {
    await supabase
      .from("documents")
      .update({ status: "paid", payment_date: today })
      .eq("id", doc.id)
      .eq("tenant_id", toTenantId);
  }

  await recordInvoicePaymentBalance(supabase, {
    tenantId: toTenantId,
    documentId: doc.id as string,
    total: Number(doc.total ?? order.accepted_amount ?? 0),
    customerId: null,
    paymentMethod: mapOrderPaymentMethod(order.payment_method as string | null),
    paymentDate: today,
    referenceNo: `order-payment:${orderId}`,
    notes: "受発注の入金確認（自動記帳）",
  });

  logger.info("[markOrderInvoicePaid] recorded", { orderId, documentId: doc.id });
}
