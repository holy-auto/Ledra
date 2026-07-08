import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 請求書 (documents) が「入金済」になったときに、売掛元帳 (payment_entries) の
 * 消込が請求額と一致するよう、不足分だけを 1 件記帳するための共有ヘルパ。
 *
 * 売掛元帳 (`/api/admin/payment-entries/ledger`) は `paid` を含む帳票を
 * `outstanding = total - Σ payment_entries.amount` で集計するため、status を
 * paid にするだけでは元帳上は未消込のまま残る。Stripe 決済リンクの自動入金と
 * 手動「入金」の両経路から本ヘルパを呼び、整合的に記帳する。
 *
 * 冪等性 (二重計上の防止):
 *  - 既存 entries の合計が total 以上なら何もしない (= 残高 0)。
 *  - referenceNo 指定時は、同一 document の同一 reference_no entry が既にあれば
 *    何もしない (Stripe webhook の再送・二重配信での重複記帳を防ぐ)。
 */
export type PaymentMethod = "cash" | "bank_transfer" | "credit_card" | "qr" | "other";

export interface RecordInvoicePaymentParams {
  tenantId: string;
  documentId: string;
  /** 請求書の総額 (円)。残高 = total - Σ既存entries を記帳する。 */
  total: number;
  paymentMethod: PaymentMethod;
  /** YYYY-MM-DD */
  paymentDate: string;
  /** Stripe payment_intent / session id 等。再送時の重複記帳ガードに使う。 */
  referenceNo?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
  /** documents.customer_id を継承する。未指定なら本ヘルパが引く。 */
  customerId?: string | null;
}

export interface RecordInvoicePaymentResult {
  recorded: boolean;
  amount: number;
}

export async function recordInvoicePaymentBalance(
  supabase: SupabaseClient,
  params: RecordInvoicePaymentParams,
): Promise<RecordInvoicePaymentResult> {
  const { tenantId, documentId, total } = params;

  // 既存入金を集計 (+ reference_no 重複チェック用に取得)
  const { data: existing, error: exErr } = await supabase
    .from("payment_entries")
    .select("amount, reference_no")
    .eq("tenant_id", tenantId)
    .eq("document_id", documentId);
  if (exErr) throw exErr;

  // 同一 reference_no が既にあれば二重記帳しない (webhook 再送ガード)。
  if (params.referenceNo && (existing ?? []).some((e) => e.reference_no === params.referenceNo)) {
    return { recorded: false, amount: 0 };
  }

  const paid = (existing ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const remaining = Math.round(total) - paid;
  if (remaining <= 0) return { recorded: false, amount: 0 };

  // customer_id を継承 (未指定時は documents から引く)
  let customerId = params.customerId ?? null;
  if (!customerId) {
    const { data: doc } = await supabase
      .from("documents")
      .select("customer_id")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    customerId = (doc?.customer_id as string | null) ?? null;
  }

  const { error: insErr } = await supabase.from("payment_entries").insert({
    id: randomUUID(),
    tenant_id: tenantId,
    document_id: documentId,
    customer_id: customerId,
    amount: remaining,
    payment_method: params.paymentMethod,
    payment_date: params.paymentDate,
    reference_no: params.referenceNo ?? null,
    notes: params.notes ?? null,
    recorded_by: params.recordedBy ?? null,
  });
  if (insErr) throw insErr;

  return { recorded: true, amount: remaining };
}
