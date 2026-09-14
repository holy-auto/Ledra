import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { storeIdOrNull } from "@/lib/stores/resolveStoreId";

/**
 * 受注承認（pending→accepted, isTo）で、指名オーダーに紐づく仮押さえを B の本予約へ変換する。
 * 発行元 B(to_tenant) のカレンダーに `reservations`(confirmed) を作り、job_orders.reservation_id を張る。
 *
 * 冪等（三重ガード）:
 *  - `reservation_id` 既存なら即 return（変換済み）。
 *  - hold の `.eq('status','pending')` UPDATE が実質のロック（先に accepted 化した1件のみ変換に進む）。
 *  - reservations 作成後の `is('reservation_id', null)` で二重張り防止。
 * 呼び出し元 PUT はステータス楽観ロックで遷移自体も1回に制限される。
 */
export async function convertHoldToReservation(orderId: string): Promise<void> {
  const admin = createServiceRoleAdmin("orders/holdConvert: 受注承認で仮押さえを本予約へ変換 (to_tenant scope)");

  const { data: order } = await admin
    .from("job_orders")
    .select("id, from_tenant_id, to_tenant_id, title, reservation_id")
    .eq("id", orderId)
    .single();
  if (!order?.to_tenant_id) return;
  if (order.reservation_id) return; // 変換済み

  // pending hold を accepted に（返却された1件のみが変換対象＝ロック代わり）。
  const { data: holds } = await admin
    .from("reservation_holds")
    .update({ status: "accepted" })
    .eq("job_order_id", orderId)
    .eq("status", "pending")
    .select("id, scheduled_date, start_time, end_time");
  const hold = holds?.[0];
  if (!hold) return; // 仮押さえ無し（枠押さえせず発注 or 既に処理済み）

  // B の顧客（A を指す linked 顧客）を予約に紐付け（無ければ null）。
  const { data: cust } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", order.to_tenant_id)
    .eq("linked_tenant_id", order.from_tenant_id)
    .limit(1)
    .maybeSingle();

  const { data: resv, error } = await admin
    .from("reservations")
    .insert({
      tenant_id: order.to_tenant_id, // B 自身の予約（他テナント booth/staff 参照なし→ガード通過）
      store_id: await storeIdOrNull(admin, order.to_tenant_id, "holdConvert"),
      customer_id: cust?.id ?? null,
      title: order.title,
      scheduled_date: hold.scheduled_date,
      start_time: hold.start_time,
      end_time: hold.end_time,
      status: "confirmed",
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !resv) {
    logger.error("[holdConvert] reservation insert failed", { orderId, error: error?.message });
    return;
  }

  await admin.from("job_orders").update({ reservation_id: resv.id }).eq("id", orderId).is("reservation_id", null);

  logger.info("[holdConvert] converted", { orderId, reservationId: resv.id, holdId: hold.id });
}

/** 却下/取消で、オーダーに紐づく pending 仮押さえを解放する。 */
export async function releaseOrderHolds(orderId: string, status: "cancelled" | "rejected"): Promise<void> {
  const admin = createServiceRoleAdmin("orders/holdConvert: 却下/取消で仮押さえを解放");
  await admin.from("reservation_holds").update({ status }).eq("job_order_id", orderId).eq("status", "pending");
}
