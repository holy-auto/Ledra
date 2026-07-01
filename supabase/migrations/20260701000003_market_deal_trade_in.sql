-- =============================================================
-- 中古車商談 ↔ 下取り車の充当 (断絶3)
--
-- 商談 (market_deals) に下取り車の参照と充当額を持たせ、見積の「支払総額」から
-- 下取り充当を差し引けるようにする。下取り車自体も在庫 (market_vehicles) として
-- 起票する運用のため、trade_in_vehicle_id は market_vehicles への FK。
--
-- ADD COLUMN は nullable / DEFAULT なしのためテーブル書き換えなし (zero-downtime)。
-- 支援索引 (CONCURRENTLY) は companion migration 20260701000004 に分離する。
-- =============================================================

alter table market_deals
  add column if not exists trade_in_vehicle_id uuid
    references market_vehicles (id) on delete set null,
  add column if not exists trade_in_allowance integer;
