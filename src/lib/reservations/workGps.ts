/**
 * 出張作業場所GPSの解析（純関数・テスト可能）。
 *
 * 作業開始/完了リクエストの body から緯度経度を取り出し、両方が妥当なときだけ座標を返す。
 * 位置情報が無い/拒否された端末では null（照合は no_reference のまま・作業は続行）。
 * ここでは座標を DB(reservations.work_lat/work_lng) に保存する（写真側の verdict のみ保存とは別運用：
 * 作業場所は照合の基準として最小権限でスタッフ運用目的に保持する）。
 */
import { mobileWorkGpsSchema } from "@/lib/validations/mobile";

export function parseWorkGps(body: unknown): { lat: number; lng: number } | null {
  const parsed = mobileWorkGpsSchema.safeParse(body);
  if (!parsed.success) return null;
  const { lat, lng } = parsed.data;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

/** 作業GPSを reservations 更新パッチに変換する（無ければ空）。timestamp は呼び出し側が渡す。 */
export function workGpsPatch(
  gps: { lat: number; lng: number } | null,
  capturedAtIso: string,
): { work_lat: number; work_lng: number; work_gps_at: string } | Record<string, never> {
  if (!gps) return {};
  return { work_lat: gps.lat, work_lng: gps.lng, work_gps_at: capturedAtIso };
}
