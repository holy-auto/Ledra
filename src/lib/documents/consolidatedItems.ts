import { DOC_TYPES, type DocType, type DocumentItem } from "@/types/document";
import type { ConsolidatedSource } from "@/lib/documents/consolidatedSources";

/** 見出し行の文言。車両（ナンバー・車種）→ 件名 → 帳票番号の順に、あるものを使う。 */
export function consolidatedHeading(src: ConsolidatedSource): string {
  const vi = (src.vehicle_info_json ?? {}) as { model?: string; plate?: string };
  const vehicle = [vi.plate, vi.model]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  return (
    vehicle || src.subject?.trim() || `${DOC_TYPES[src.doc_type as DocType]?.label ?? src.doc_type} ${src.doc_number}`
  );
}

/**
 * 合算請求書の明細を、元帳票の明細から組み立てる（1枚目に内訳を出すため）。
 * 元帳票ごとに「見出し行（車両等）→ 元の明細行 → 小計行」を並べる。小計行で区切るのは、
 * 元帳票の中の小計行が前の元帳票の金額まで累積しないようにするため（calcItems は直前の小計行から累積する）。
 *
 * 税込/税抜は1枚の帳票で1つしか持てない（calcItems）。元帳票で税込/税抜が混在する、または税込で
 * 税率が混在する場合はまとめられないので null を返す（呼び出し側は従来の「1帳票=1行」に戻す）。
 * 税額は合算後の明細から計算し直す（インボイス制度の端数処理は請求書1枚・税率ごとに1回）ので、
 * 元帳票の消費税の合計と1円単位でずれることがある。
 */
export function buildConsolidatedItems(
  sources: (ConsolidatedSource & { meta_json?: unknown })[],
): { items: DocumentItem[]; taxRate: number; isTaxInclusive: boolean } | null {
  if (sources.length === 0) return null;
  const inclusive = (s: { meta_json?: unknown }) =>
    (s.meta_json as { is_tax_inclusive?: unknown } | null)?.is_tax_inclusive === true;
  const isTaxInclusive = inclusive(sources[0]);
  if (sources.some((s) => inclusive(s) !== isTaxInclusive)) return null;

  // tax_category が無い古い明細は、calcItems が併記している tax_rate を見て、それも無ければ元帳票の既定税率
  const rateOf = (s: ConsolidatedSource, it: DocumentItem) =>
    it.tax_category ?? (it as { tax_rate?: number | null }).tax_rate ?? s.tax_rate;
  const taxRate = sources[0].tax_rate;
  if (
    isTaxInclusive &&
    sources.some((s) =>
      (s.items_json ?? []).some((it) => (it.item_type ?? "item") === "item" && rateOf(s, it) !== taxRate),
    )
  ) {
    return null;
  }

  const items: DocumentItem[] = [];
  for (const src of sources) {
    items.push({ item_type: "heading", description: consolidatedHeading(src), quantity: 0, unit_price: 0, amount: 0 });
    for (const it of src.items_json ?? []) {
      // 税抜では行ごとの税率区分で集計するので、元帳票の既定税率を行に明示しておく
      items.push(
        (it.item_type ?? "item") === "item" && !isTaxInclusive ? { ...it, tax_category: rateOf(src, it) } : it,
      );
    }
    items.push({ item_type: "subtotal", description: "小計", quantity: 0, unit_price: 0, amount: 0 });
  }
  return { items, taxRate, isTaxInclusive };
}
