/**
 * 写真GPSと基準座標（店舗・作業場所）の整合性チェック（純関数）。
 *
 * プライバシー方針: 生のGPS座標は保存しない。この関数の出力（結果のみ）を保存し、
 * 呼び出し側は座標を破棄する。距離は帯（bucket）に丸めて精密な位置を残さない。
 */
import { haversineMeters, isValidLatLng, type LatLng } from "./distance";

export type GpsCheckVerdict =
  | "match_store" // 店舗の許容半径内
  | "mismatch" // 基準座標から離れている
  | "no_gps" // 写真にGPSが無い（または不正）
  | "no_reference"; // 基準座標（店舗等）が未登録

export type GpsDistanceBucket = "within_1km" | "within_10km" | "within_50km" | "beyond_50km" | null;

export interface PhotoLocationResult {
  verdict: GpsCheckVerdict;
  /** 距離の帯（精密な位置は残さない）。no_gps/no_reference では null。 */
  distanceBucket: GpsDistanceBucket;
}

/** 距離（m）を粗い帯に丸める（精密な位置を保存しないため）。 */
export function bucketDistance(meters: number): GpsDistanceBucket {
  if (!Number.isFinite(meters)) return null;
  if (meters <= 1_000) return "within_1km";
  if (meters <= 10_000) return "within_10km";
  if (meters <= 50_000) return "within_50km";
  return "beyond_50km";
}

export interface PhotoLocationCheckInput {
  /** 写真から抽出したGPS（メモリ内のみ・保存しない）。無ければ null。 */
  photo: LatLng | null;
  /** 基準となる店舗座標。未登録なら null。 */
  store: LatLng | null;
  /** 一致とみなす許容半径（メートル）。既定 2km（出張なしの店内作業を想定）。 */
  radiusMeters?: number;
}

/**
 * 写真GPSが店舗の許容半径内かを判定する。生座標は返さず結果のみ。
 * - 写真GPS無し/不正 → no_gps
 * - 基準座標無し → no_reference
 * - 半径内 → match_store、超過 → mismatch（距離は帯で付す）
 */
export function checkPhotoLocation(input: PhotoLocationCheckInput): PhotoLocationResult {
  const radius = input.radiusMeters ?? 2_000;
  if (!isValidLatLng(input.photo)) return { verdict: "no_gps", distanceBucket: null };
  if (!isValidLatLng(input.store)) return { verdict: "no_reference", distanceBucket: null };
  const meters = haversineMeters(input.photo, input.store);
  const bucket = bucketDistance(meters);
  return { verdict: meters <= radius ? "match_store" : "mismatch", distanceBucket: bucket };
}
