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
import { deriveTaxRateFromSquareAmounts, mapSquareLineItems } from "@/lib/documents/squareReceipt";
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

    // 既に作成済みなら既存の領収書をそのまま返す（二重作成防止・冪等）。
    // square_orders.receipt_document_id が何らかの理由で更新に失敗していた場合に備え、
    // documents.meta_json の square_order_id からも既存領収書を探す（自己修復）。
    const existingReceiptId = order.receipt_document_id;
    let existing: Record<string, unknown> | null = null;
    if (existingReceiptId) {
      const { data } = await admin.from("documents").select(DOC_SELECT).eq("id", existingReceiptId).maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await admin
        .from("documents")
        .select(DOC_SELECT)
        .eq("tenant_id", caller.tenantId)
        .eq("doc_type", "receipt")
        .contains("meta_json", { square_order_id: order.square_order_id })
        .maybeSingle();
      existing = data;
    }
    if (existing) {
      if (!existingReceiptId) {
        await admin
          .from("square_orders")
          .update({ receipt_document_id: existing.id })
          .eq("id", id)
          .eq("tenant_id", caller.tenantId);
      }
      return apiOk({ document: existing, already_exists: true });
    }

    let recipientName: string | null = null;
    if (order.customer_id) {
      const { data: customer } = await admin.from("customers").select("name").eq("id", order.customer_id).maybeSingle();
      recipientName = customer?.name ?? null;
    }

    const taxRate = deriveTaxRateFromSquareAmounts(order.total_amount, order.tax_amount ?? 0);

    const rawItems: any[] = Array.isArray(order.items_json) ? order.items_json : [];
    const items =
      rawItems.length > 0
        ? mapSquareLineItems(rawItems, taxRate)
        : [
            {
              description: "Square売上",
              quantity: 1,
              unit_price: order.total_amount,
              tax_category: taxRate,
            },
          ];

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

    const { error: linkErr } = await admin
      .from("square_orders")
      .update({ receipt_document_id: data.id })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);
    if (linkErr) {
      // documents 側の作成自体は成功しているため失敗させない。
      // 次回呼び出し時は meta_json.square_order_id 側の照合で自己修復される。
      console.error("[square order receipt] failed to persist receipt_document_id link:", linkErr.message);
    }

    return apiOk({ document: data });
  } catch (e) {
    return apiInternalError(e, "square order receipt POST");
  }
}
