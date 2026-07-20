-- =============================================================
-- job_orders.reservation_id — 指名オーダーと本予約の紐付け
--
-- 受注承認時に、仮押さえ(reservation_holds)を B のカレンダーの本予約(reservations)へ
-- 変換し、その reservation の id をここに保存する。全 NULL の新規列（後方互換）。
-- =============================================================

ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL;

COMMENT ON COLUMN job_orders.reservation_id IS
  '受注承認で仮押さえから変換された本予約(reservations.id)。指名発注の枠押さえ用。';
