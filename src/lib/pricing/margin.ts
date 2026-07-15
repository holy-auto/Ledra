/**
 * 原価・利益率から提供価格（販売価格）を算出するユーティリティ。
 *
 * 方式: マークアップ率方式
 *   selling_price = round(cost × (1 + margin_rate / 100))
 *
 * - cost: 原価（整数円）
 * - margin_rate: 利益率（％）。null/undefined の場合は未設定として cost をそのまま返す
 *
 * 例: cost=1000, margin=30 → 1300
 *     cost=1000, margin=null → 1000
 */
export function calcSellingPrice(cost: number, marginRate: number | null | undefined): number {
  const c = Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : 0;
  if (marginRate == null || !Number.isFinite(marginRate)) return c;
  return Math.round(c * (1 + marginRate / 100));
}

/**
 * 提供価格と原価から利益率を逆算する。
 * 原価が 0 の場合は null を返す（マークアップ率が定義できないため）。
 */
export function calcMarginRate(cost: number, sellingPrice: number): number | null {
  const c = Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : 0;
  const p = Number.isFinite(sellingPrice) ? Math.floor(sellingPrice) : 0;
  if (c === 0) return null;
  return Math.round(((p - c) / c) * 10000) / 100; // 小数2桁
}

/**
 * 案件金額とレス率（％）から外注職人への支払額を算出する。
 *   payout = round(base_amount × rate / 100)
 * - base_amount: 案件金額（整数円）
 * - rate: レス率（％）。null/undefined の場合は未設定として base_amount をそのまま返す
 */
export function calcCommissionAmount(baseAmount: number, ratePercent: number | null | undefined): number {
  const b = Number.isFinite(baseAmount) && baseAmount > 0 ? Math.floor(baseAmount) : 0;
  if (ratePercent == null || !Number.isFinite(ratePercent)) return b;
  return Math.round(b * (ratePercent / 100));
}
