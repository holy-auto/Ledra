/**
 * 地理座標の距離計算（純関数）。写真GPSと店舗/作業場所の整合性チェックに使う。
 * 外部ジオコーダやAPIには依存しない。
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000; // 平均半径（メートル）

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 妥当な緯度経度か（NaN/範囲外を弾く）。 */
export function isValidLatLng(p: unknown): p is LatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * 2点間の大圏距離（メートル）。Haversine 公式。
 * // ponytail: 球面近似（誤差 ~0.5%）。整合性チェックの半径（km 単位）には十分。
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
