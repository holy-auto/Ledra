import type { SupabaseClient } from "@supabase/supabase-js";
import { hasInlineConsolidatedItems, showsConsolidatedBreakdown, type DocumentRow } from "@/types/document";
import { logger } from "@/lib/logger";

/** 合算請求書の元帳票（内訳表示用）。詳細画面と PDF の「合算内訳」で使う。 */
export type ConsolidatedSource = Pick<
  DocumentRow,
  | "id"
  | "doc_type"
  | "doc_number"
  | "issued_at"
  | "subject"
  | "vehicle_info_json"
  | "items_json"
  | "subtotal"
  | "tax"
  | "total"
  | "tax_rate"
  | "meta_json"
  | "customer_id"
  | "status"
>;

/** meta_json.source_document_ids（一覧の合算作成時に保存する元帳票ID）を、文字列だけの配列で返す。 */
export function consolidatedSourceIds(metaJson: unknown): string[] {
  const raw = (metaJson as { source_document_ids?: unknown } | null)?.source_document_ids;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 合算請求書の明細は「元帳票1件=1行（合計額のみ）」なので、元帳票の明細を内訳として引く。
 * 一覧の合算作成時に meta_json.source_document_ids へ元帳票IDを保存している。
 * 合算請求書以外・ID未保存（オーダー締めの合算等）は空配列。並びは合算時の順。
 * 作成時に「内訳を表示しない」を選んだ帳票でも返す（管理画面では常に見せる）。PDF 側は
 * `consolidatedSourcesForPdf` を使う。
 */
export async function loadConsolidatedSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  tenantId: string,
  doc: { doc_type: string; meta_json?: unknown },
): Promise<ConsolidatedSource[]> {
  if (doc.doc_type !== "consolidated_invoice") return [];
  const ids = consolidatedSourceIds(doc.meta_json);
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("documents")
    .select(
      "id, doc_type, doc_number, issued_at, subject, vehicle_info_json, items_json, subtotal, tax, total, tax_rate, meta_json, customer_id, status",
    )
    .in("id", ids)
    .eq("tenant_id", tenantId);
  // 内訳は請求額を変えない参考情報なので、取得失敗でも帳票本体の表示・PDF は止めない（ログだけ残す）
  if (error) logger.warn("[consolidatedSources] fetch failed", { tenantId, err: error.message });
  const byId = new Map(((data ?? []) as ConsolidatedSource[]).map((d) => [d.id, d]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * PDF（ダウンロード・顧客共有）の別紙に載せる合算内訳。作成時に「内訳を表示しない」を選んだ帳票と、
 * 内訳を1枚目の明細に組み込んだ帳票（別紙は重複になる）は空。
 */
export async function consolidatedSourcesForPdf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  tenantId: string,
  doc: { doc_type: string; meta_json?: unknown },
): Promise<ConsolidatedSource[]> {
  return showsConsolidatedBreakdown(doc.meta_json) && !hasInlineConsolidatedItems(doc.meta_json)
    ? loadConsolidatedSources(client, tenantId, doc)
    : [];
}
