/**
 * この証明書を「その案件から発行した」と見なしてよいか。
 *
 * 取り違え（別案件を「作成済」に誤マーク）を防ぐのが目的なので、
 * **両方に値があって食い違うときだけ** false にする。
 *
 * 「予約側が空」は矛盾ではない —— ここを不一致として弾いていたため、
 * 本番の証明書45件すべてで `reservation_id` が null になり、作業詳細の
 * 「施工写真を撮影」が永久に0件になっていた（予約169件のうち
 * customer_id があるのは5件・vehicle_id は0件）。
 */
export function linksToReservation(
  job: { vehicle_id: string | null; customer_id: string | null },
  resolved: { vehicleId: string | null; customerId: string | null },
): boolean {
  const vehicleOk = !job.vehicle_id || !resolved.vehicleId || job.vehicle_id === resolved.vehicleId;
  const customerOk = !job.customer_id || !resolved.customerId || job.customer_id === resolved.customerId;
  return vehicleOk && customerOk;
}
