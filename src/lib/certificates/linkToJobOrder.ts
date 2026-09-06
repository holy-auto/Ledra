/**
 * この証明書を「その発注（job_orders）から発行した」と見なしてよいか。
 *
 * `linksToReservation` と**わざと非対称**にしてある。予約紐付けは取り違えを防ぐのが
 * 目的なので「両方に値があって食い違うときだけ」弾けば足りる。こちらは違う:
 * **紐付けた証明書は相手方テナント（発注元／受注先）の画面に出る**ので、別の顧客の
 * 証明書が紛れ込むとそのまま他社への誤開示になる。
 *
 * とはいえ機械的に検証できる材料は限られる。job_orders は顧客を持たず、vehicle_id も
 * 任意で、受発注画面（OrdersClient）は車両を送らないため **UI から作られた発注は
 * vehicle_id = NULL**。そこで:
 *
 *   - 発注に車両がある → 証明書側の車両と**厳密一致**を要求する（未確定も弾く）
 *   - 発注に車両が無い → ここでは検証できない。true を返すが、それは
 *     「確認した」ではなく「材料が無い」という意味。歯止めは発行フォーム側の明示
 *     （CertNewFormWrapper の紐付けチェックボックス）に置いてある。
 *
 * 一度この判定に null 寛容な linksToReservation を流用して、**最も多いケース
 * （vehicle_id = NULL の発注）で常に true になる素通り**を作った。名前と型を分けて
 * 同じ取り違えが起きないようにしている。
 */
export function linksToJobOrder(order: { vehicle_id: string | null }, resolved: { vehicleId: string | null }): boolean {
  if (!order.vehicle_id) return true; // 検証不能（発注に車両が無い）
  return order.vehicle_id === resolved.vehicleId;
}
