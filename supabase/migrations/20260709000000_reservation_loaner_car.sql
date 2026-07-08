-- =============================================================
-- 予約に代車を割り当てる（将来枠の代車空きを正確に見るため）
--
-- 背景:
--   日程候補提案の代車空きは「未返却貸出(loaner_car_loans)の返却予定日」で近似していたが、
--   将来の予約に対してどの代車を押さえるかは表現できなかった。予約に代車を割り当てられる
--   ようにし、指定日にどの代車が既に押さえられているかを実データで判定する。
--
-- 設計（追加のみ / 既存を壊さない）:
--   reservations.loaner_car_id: その予約で使う代車。単一カラム FK（on delete set null）。
--   テナント整合はアプリ層（validateReservationRefs）で担保（assigned_staff_id / booth_id と同方針）。
--   ある日の空き代車 = 稼働中の代車台数 −（その日の未キャンセル予約に割り当てられた代車数）。
--   ponytail: 予約は単一 scheduled_date のため、代車は予約日当日のみ「押さえ」とみなす。
--   複数日にまたがる貸出の押さえは、返却予定日を持つ明示レンジのモデル化を今後入れる。
-- =============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS loaner_car_id uuid REFERENCES loaner_cars(id) ON DELETE SET NULL;

COMMENT ON COLUMN reservations.loaner_car_id IS
  'この予約で使う代車（loaner_cars.id）。日程候補の代車空き判定に使う。NULL=代車なし。';
