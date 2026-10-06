import type { SupabaseClient } from "@supabase/supabase-js";
import { isDocumentDeletable } from "@/types/document";

type DeletableCandidate = {
  id: string;
  doc_type: string;
  status: string;
  meta_json?: unknown;
  counterparty_tenant_id?: string | null;
};

/**
 * オーダー締め（cycleInvoice）の合算か。`meta_json.source` は以前の帳票更新が meta_json を丸ごと
 * 置き換えていたため、下書きを編集した既存帳票では消えている。cycleInvoice は加盟店間の請求として
 * `counterparty_tenant_id` も入れ、こちらは更新 API で書き換わらないので両方で見る。
 */
const isOrderCycleInvoice = (d: DeletableCandidate) =>
  (d.meta_json as { source?: unknown } | null)?.source === "job_order_cycle" || !!d.counterparty_tenant_id;

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
      isDocumentDeletable(d.doc_type, d.status) && (!isSentConsolidated(d) || (isAdmin && !isOrderCycleInvoice(d))),
  );
  const sentConsolidatedIds = eligible.filter(isSentConsolidated).map((d) => d.id);
  if (sentConsolidatedIds.length === 0) return { eligible };

  const linked = new Set<string>();
  for (const table of ["payment_entries", "billing_splits"]) {
    const error = await collectLinkedDocumentIds(client, table, tenantId, sentConsolidatedIds, linked);
    if (error) return { eligible: [], error };
  }
  eligible = eligible.filter((d) => !linked.has(d.id));
  return { eligible };
}

const PAGE = 1000;

/**
 * table の document_id を全件読んで linked に足す。PostgREST は1回の応答を max_rows（1000）で切るので、
 * 1回の SELECT だと1000行を超えた分の帳票が「紐付きなし」に見え、削除で cascade されてしまう。
 * キーセット方式（id 順・直前の id より後）で空ページまで読む（サーバ側の上限が小さくても取りこぼさない）。
 */
async function collectLinkedDocumentIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  table: string,
  tenantId: string,
  documentIds: string[],
  linked: Set<string>,
): Promise<{ message: string } | null> {
  let after: string | null = null;
  for (;;) {
    let q = client
      .from(table)
      .select("id, document_id")
      .in("document_id", documentIds)
      .eq("tenant_id", tenantId)
      .order("id")
      .limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) return error;
    const rows = (data ?? []) as { id: string; document_id: string }[];
    if (rows.length === 0) return null;
    for (const r of rows) linked.add(r.document_id);
    after = rows[rows.length - 1].id;
  }
}
