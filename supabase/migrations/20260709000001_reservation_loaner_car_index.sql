-- reservations.loaner_car_id の日別 lookup 用インデックス。
-- 日程候補の代車空き判定で「指定日・テナントの代車割当」を引くため。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため独立ファイルに置く。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_loaner_date
  ON reservations (tenant_id, scheduled_date, loaner_car_id)
  WHERE loaner_car_id IS NOT NULL;
