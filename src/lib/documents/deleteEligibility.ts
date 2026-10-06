import type { SupabaseClient } from "@supabase/supabase-js";
import { isDocumentDeletable } from "@/types/document";

type DeletableCandidate = { id: string; doc_type: string; status: string; meta_json?: unknown };

const isSentConsolidated = (d: { doc_type: string; status: string }) =>
  d.doc_type === "consolidated_invoice" && d.status !== "draft";

/**
 * 削除してよい帳票だけを返す。DELETE API（実際に消す側）と詳細画面（削除ボタンを出すか）の両方で使う。
 *
 * 送付後の合算請求書（＝発行済みの請求）は `isDocumentDeletable` で通っても、次のものは外す。
 * - 管理者ロール未満の操作（下書き・領収書の削除は従来どおり staff 可）
 * - オーダー締めの合算（cycleInvoice）: job_orders.invoice_number に番号を刻んでおり、消すと
 *   そのオーダーが「請求済み」のまま次の締めで拾われず、二度と請求されない
 * - 入金記録（一部入金を含む）・支払者按分があるもの: payment_entries / billing_splits は
 *   documents に on delete cascade なので、入金履歴・按分（保険請求番号等）ごと消える
 *
 * @returns 取得に失敗したら error（呼び出し側は fail-closed にする）
 */
export async function filterDeletableDocuments<T extends DeletableCandidate>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  tenantId: string,
  docs: T[],
  isAdmin: boolean,
): Promise<{ eligible: T[]; error?: { message: string } }> {
  let eligible = docs.filter(
    (d) =>
      isDocumentDeletable(d.doc_type, d.status) &&
      (!isSentConsolidated(d) ||
        (isAdmin && (d.meta_json as { source?: unknown } | null)?.source !== "job_order_cycle")),
  );
  const sentConsolidatedIds = eligible.filter(isSentConsolidated).map((d) => d.id);
  if (sentConsolidatedIds.length === 0) return { eligible };

  const [payments, splits] = await Promise.all(
    ["payment_entries", "billing_splits"].map((table) =>
      client.from(table).select("document_id").in("document_id", sentConsolidatedIds).eq("tenant_id", tenantId),
    ),
  );
  const error = payments.error ?? splits.error;
  if (error) return { eligible: [], error };
  const linked = new Set(
    [...(payments.data ?? []), ...(splits.data ?? [])].map((r) => (r as { document_id: string }).document_id),
  );
  eligible = eligible.filter((d) => !linked.has(d.id));
  return { eligible };
}
