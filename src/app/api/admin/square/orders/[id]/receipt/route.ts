import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";
import { calcItems } from "@/lib/documents/calcItems";
import { DOC_TYPES } from "@/types/document";

export const dynamic = "force-dynamic";

const DOC_SELECT =
  "id, tenant_id, customer_id, doc_type, doc_number, issued_at, status, subtotal, tax, total, tax_rate, items_json, note, meta_json, created_at";

// ─── POST: Square オーダーから領収書を作成 ───
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id } = await params;
    if (!id) return apiValidationError("オーダーIDが必要です。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: order } = await admin
      .from("square_orders")
      .select(
        "id, square_order_id, total_amount, tax_amount, items_json, customer_id, square_created_at, receipt_document_id",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!order) return apiNotFound("指定されたSquareオーダーが見つかりません。");

    // 既に作成済みなら既存の領収書をそのまま返す（二重作成防止・冪等）
    if (order.receipt_document_id) {
      const { data: existing } = await admin
        .from("documents")
        .select(DOC_SELECT)
        .eq("id", order.receipt_document_id)
        .maybeSingle();
      if (existing) return apiOk({ document: existing, already_exists: true });
    }

    let recipientName: string | null = null;
    if (order.customer_id) {
      const { data: customer } = await admin.from("customers").select("name").eq("id", order.customer_id).maybeSingle();
      recipientName = customer?.name ?? null;
    }

    const rawItems: any[] = Array.isArray(order.items_json) ? order.items_json : [];
    const items =
      rawItems.length > 0
        ? rawItems.map((li: any) => {
            const qty = parseFloat(String(li.quantity ?? "1")) || 1;
            const totalMoney = Number(li.total_money?.amount ?? 0);
            const unitPrice = totalMoney > 0 ? Math.round(totalMoney / qty) : Number(li.base_price_money?.amount ?? 0);
            return {
              description: li.name || "商品",
              quantity: qty,
              unit_price: unitPrice,
              tax_category: 10,
            };
          })
        : [
            {
              description: "Square売上",
              quantity: 1,
              unit_price: order.total_amount,
              tax_category: 10,
            },
          ];

    // Square の税込金額から実効税率を逆算する（不明時は標準税率10%）
    const taxAmount = order.tax_amount ?? 0;
    const preTax = order.total_amount - taxAmount;
    const taxRate = preTax > 0 && taxAmount > 0 ? Math.round((taxAmount / preTax) * 100) : 10;

    const { itemsJson, subtotal, tax, total, taxBreakdown } = calcItems(items, taxRate, true);

    const issuedAt = (order.square_created_at ?? new Date().toISOString()).slice(0, 10);
    const docType = "receipt" as const;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: order.customer_id ?? null,
      recipient_name: recipientName,
      recipient_honorific: recipientName ? "様" : "御中",
      doc_type: docType,
      issued_at: issuedAt,
      payment_date: issuedAt,
      status: "paid",
      subtotal,
      tax,
      total,
      tax_rate: taxRate,
      tax_breakdown: taxBreakdown,
      items_json: itemsJson,
      note: `Square注文 ${order.square_order_id} より作成`,
      meta_json: { square_order_id: order.square_order_id, is_tax_inclusive: true },
      show_seal: false,
      show_logo: true,
      show_bank_info: false,
    };

    const { data, error } = await insertDocWithRetry(
      admin,
      caller.tenantId,
      docType,
      DOC_TYPES[docType].prefix,
      (docNumber) =>
        admin
          .from("documents")
          .insert({ ...row, doc_number: docNumber })
          .select(DOC_SELECT)
          .single(),
    );

    if (error) return apiInternalError(error, "square order receipt POST");

    await admin
      .from("square_orders")
      .update({ receipt_document_id: data.id })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    return apiOk({ document: data });
  } catch (e) {
    return apiInternalError(e, "square order receipt POST");
  }
}
