/**
 * 品目マスタ (menu_items) のサイズ別価格の共有ロジック。
 *
 * バリデーション (menu-item.ts)・概算計算 (quoteReplyAuto.ts)・登録UI で同じ定義を
 * 使うための単一ソース。IO を持たない純関数のみ。
 *
 * size_axis:
 *   - null          … 従来どおり単一単価 (unit_price)。
 *   - "vehicle_size"… 車両サイズ (SS〜XL)。concept は vehicle_size_master の size_class と一致。
 *   - "wheel_size"  … ホイールインチ ("16","17"… など任意のインチ文字列)。
 *
 * size_prices は「段キー -> 税抜価格(正の整数円)」の対応表。
 */

/** 車両サイズの段。vehicle_size_master.size_class / sizeMultiplier と同一の並び。 */
export const VEHICLE_SIZE_TIERS = ["SS", "S", "M", "L", "LL", "XL"] as const;
export type VehicleSizeTier = (typeof VEHICLE_SIZE_TIERS)[number];

export const SIZE_AXES = ["vehicle_size", "wheel_size"] as const;
export type SizeAxis = (typeof SIZE_AXES)[number];

export type SizePrices = Record<string, number>;

export function isSizeAxis(v: unknown): v is SizeAxis {
  return v === "vehicle_size" || v === "wheel_size";
}

/** ホイールインチのキーとして妥当か (10〜30 の整数文字列)。表記ゆれを防ぐため範囲を絞る。 */
export function isWheelInchKey(key: string): boolean {
  if (!/^\d{2}$/.test(key)) return false;
  const n = Number(key);
  return n >= 10 && n <= 30;
}

/**
 * 軸に対して size_prices が妥当かを検証し、正規化した表を返す。
 * - 各値は正の整数円のみ採用 (0・負・非整数は捨てる)。
 * - vehicle_size: キーは SS〜XL のみ。wheel_size: キーは 2桁インチ(10〜30) のみ。
 * - 妥当な段が1つも無ければ null (= 実質サイズ別価格なし)。
 */
export function sanitizeSizePrices(axis: SizeAxis, input: unknown): SizePrices | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const allowedKey = (k: string): boolean =>
    axis === "vehicle_size" ? (VEHICLE_SIZE_TIERS as readonly string[]).includes(k) : isWheelInchKey(k);
  const out: SizePrices = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedKey(k)) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n > 0) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * API 受け取り値 (軸・価格表) を保存用に正規化する。
 * - 軸が未知/未指定なら単一単価扱い ({ null, null })。
 * - 妥当な段が1つも無ければ軸も落として単一単価扱いにする (中途半端な「軸だけ有り価格空」を作らない)。
 */
export function normalizeMenuSizePricing(
  rawAxis: unknown,
  rawPrices: unknown,
): { size_axis: SizeAxis | null; size_prices: SizePrices | null } {
  const axis = isSizeAxis(rawAxis) ? rawAxis : null;
  if (!axis) return { size_axis: null, size_prices: null };
  const prices = sanitizeSizePrices(axis, rawPrices);
  return prices ? { size_axis: axis, size_prices: prices } : { size_axis: null, size_prices: null };
}

/**
 * 車両サイズ (size_class) に対応する税抜価格を返す。
 * 完全一致が無ければ「登録されている段のうち一番近い下の段 → 無ければ一番近い上の段」で補完する
 * (例: L の価格が未登録なら M を、M も無ければ LL を使う)。どの段も無ければ null。
 */
export function priceForVehicleSize(sizePrices: SizePrices, sizeClass: string | null | undefined): number | null {
  const cls = (sizeClass ?? "").toUpperCase();
  if (cls && sizePrices[cls] != null) return sizePrices[cls];
  const idx = (VEHICLE_SIZE_TIERS as readonly string[]).indexOf(cls);
  if (idx < 0) return null; // size_class 不明: 補完の基準が無いので使わない (呼び出し側でフォールバック)
  for (let d = 1; d < VEHICLE_SIZE_TIERS.length; d++) {
    const lower = VEHICLE_SIZE_TIERS[idx - d];
    if (lower && sizePrices[lower] != null) return sizePrices[lower];
    const upper = VEHICLE_SIZE_TIERS[idx + d];
    if (upper && sizePrices[upper] != null) return sizePrices[upper];
  }
  return null;
}
