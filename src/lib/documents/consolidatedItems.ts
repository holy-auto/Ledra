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
 * 元帳票ごとに「見出し行（車両等）→ 元の明細行 → 小計行」を並べる。元帳票の中の小計行は落とす
 * （calcItems は直前の小計行から累積するので、残すと車両ごとの小計がその後ろの分しか数えない）。
 *
 * 次の場合はまとめられないので null を返す（呼び出し側は従来の「1帳票=1行」に戻す）。
 * - 元帳票で税込/税抜が混在する、または税込で税率が混在する（calcItems は1枚につき税込/税抜を1つしか持てない）
 * - 元帳票の明細から計算し直した金額が、元帳票の保存額（税抜なら小計・税込なら合計）と合わない
 *   （旧データ等。合わないまま組むと請求額が黙って変わる）
 * 税額は合算後の明細から計算し直す（インボイス制度の端数処理は請求書1枚・税率ごとに1回）ので、
 * 元帳票の消費税の合計と1円単位でずれることはある。
 */
export function buildConsolidatedItems(
  sources: ConsolidatedSource[],
): { items: DocumentItem[]; taxRate: number; isTaxInclusive: boolean } | null {
  if (sources.length === 0) return null;
  const inclusive = (s: ConsolidatedSource) =>
    (s.meta_json as { is_tax_inclusive?: unknown } | null)?.is_tax_inclusive === true;
  const isTaxInclusive = inclusive(sources[0]);
  if (sources.some((s) => inclusive(s) !== isTaxInclusive)) return null;

  const isItem = (it: DocumentItem) => (it.item_type ?? "item") === "item";
  // tax_category が無い古い明細は、calcItems が併記している tax_rate / is_reduced_rate を見て、
  // それも無ければ元帳票の既定税率
  const rateOf = (s: ConsolidatedSource, it: DocumentItem) => {
    const legacy = it as { tax_rate?: number | null; is_reduced_rate?: boolean };
    return it.tax_category ?? legacy.tax_rate ?? (legacy.is_reduced_rate ? 8 : s.tax_rate);
  };
  const taxRate = sources[0].tax_rate;
  if (
    isTaxInclusive &&
    sources.some((s) => (s.items_json ?? []).some((it) => isItem(it) && rateOf(s, it) !== taxRate))
  ) {
    return null;
  }
  // calcItems と同じ式で各行の金額を出し、元帳票の保存額を再現できるか確かめる
  const lineAmount = (it: DocumentItem) =>
    Math.round((parseFloat(String(it.quantity || 0)) || 0) * parseInt(String(it.unit_price || 0), 10));
  const reproduces = (s: ConsolidatedSource) =>
    (s.items_json ?? []).filter(isItem).reduce((sum, it) => sum + lineAmount(it), 0) ===
    (isTaxInclusive ? s.total : s.subtotal);
  if (!sources.every(reproduces)) return null;

  const items: DocumentItem[] = [];
  for (const src of sources) {
    items.push({ item_type: "heading", description: consolidatedHeading(src), quantity: 0, unit_price: 0, amount: 0 });
    for (const it of src.items_json ?? []) {
      if (it.item_type === "subtotal") continue;
      // 税抜では行ごとの税率区分で集計するので、元帳票の税率を行に明示しておく
      items.push(isItem(it) && !isTaxInclusive ? { ...it, tax_category: rateOf(src, it) } : it);
    }
    items.push({ item_type: "subtotal", description: "小計", quantity: 0, unit_price: 0, amount: 0 });
  }
  return { items, taxRate, isTaxInclusive };
}
