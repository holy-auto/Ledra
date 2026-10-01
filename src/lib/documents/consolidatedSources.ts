import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentRow } from "@/types/document";

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
>;

/**
 * 合算請求書の明細は「元帳票1件=1行（合計額のみ）」なので、元帳票の明細を内訳として引く。
 * 一覧の合算作成時に meta_json.source_document_ids へ元帳票IDを保存している。
 * 合算請求書以外・ID未保存（オーダー締めの合算等）は空配列。並びは合算時の順。
 */
export async function loadConsolidatedSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  tenantId: string,
  doc: { doc_type: string; meta_json?: unknown },
): Promise<ConsolidatedSource[]> {
  if (doc.doc_type !== "consolidated_invoice") return [];
  const raw = (doc.meta_json as { source_document_ids?: unknown } | null)?.source_document_ids;
  const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  if (ids.length === 0) return [];
  const { data } = await client
    .from("documents")
    .select(
      "id, doc_type, doc_number, issued_at, subject, vehicle_info_json, items_json, subtotal, tax, total, tax_rate",
    )
    .in("id", ids)
    .eq("tenant_id", tenantId);
  const byId = new Map(((data ?? []) as ConsolidatedSource[]).map((d) => [d.id, d]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
