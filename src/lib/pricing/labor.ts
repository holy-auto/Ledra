/**
 * 標準工数 × レバーレートから工賃（提供価格）を算出するユーティリティ。
 *
 * 方式: 日整連 (JASPA) 等の標準工数方式
 *   labor_price = ceil(labor_hours × rate_per_hour)   … 1円未満は切り上げ（2026-09-24 代表判断）
 *
 * - laborHours: 標準工数（時間、小数可。日整連指数など）
 * - ratePerHour: レバーレート（円/時）。テナント設定 tenants.labor_rate_per_hour
 *
 * どちらかが未設定 (null/undefined) または 0 以下の場合は算出不能として null を返す。
 * 呼び出し側は null のとき既存の unit_price を維持する。
 *
 * 例: hours=1.2, rate=9000 → 10800
 */
export function calcLaborPrice(
  laborHours: number | null | undefined,
  ratePerHour: number | null | undefined,
): number | null {
  if (laborHours == null || !Number.isFinite(laborHours) || laborHours <= 0) return null;
  if (ratePerHour == null || !Number.isFinite(ratePerHour) || ratePerHour <= 0) return null;
  // 0.07 × 7000 が 490.00000000000006 になるなど、小数の誤差だけで 1 円切り上がらないよう
  // 先に小数第6位で丸めてから切り上げる
  return Math.ceil(Math.round(laborHours * ratePerHour * 1e6) / 1e6);
}
