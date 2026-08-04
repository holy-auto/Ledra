/**
 * 金額系クエリパラメータ（amount_min / amount_max 等）を「フィルタ値 or フィルタ無し」に
 * 正規化する。
 *
 * 未指定（null / 空文字 / 空白のみ）は「フィルタ無し」を意味するので **null** を返す。
 * 注意: `Number("")` は `0` になるため、空判定を先に行わずに数値化すると、パラメータ
 * 未指定時に `total >= 0 && total <= 0`（＝ total=0）で絞り込んでしまい、金額>0 の
 * 全レコードが 0 件になる。実際にこれが本番の「帳票が表示されない」不具合の原因だった。
 *
 * @returns 0 以上の整数（切り捨て）、または「フィルタ無し」を表す null
 */
export function parseAmountParam(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
