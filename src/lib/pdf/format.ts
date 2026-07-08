/**
 * 帳票 PDF 共通のフォーマットヘルパー。
 *
 * pdfInvoice.tsx / pdfDocument.tsx で byte-identical に重複していたものを集約した。
 * 日付は必ず JST (Asia/Tokyo) で確定させる — サーバTZ (UTC) だと発行日が1日ずれる。
 */

/** 金額を "¥1,234" 形式で整形。null/undefined は "-"。 */
export function fmtJpy(n: number | null | undefined): string {
  if (n == null) return "-";
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** ISO 文字列を "ja-JP" ロケール・JST で日付整形。パース不能なら原文を返す。 */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** 金額を桁区切りのみ ("1,234") で整形。合計金額の強調表示用。 */
export function fmtTotal(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ja-JP");
}
