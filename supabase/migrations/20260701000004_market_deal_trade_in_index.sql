-- =============================================================
-- market_deals.trade_in_vehicle_id の FK covering index (CONCURRENTLY)
--
-- Companion to 20260701000003 (カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- 下取り車削除時の on delete set null / 逆引き lookup のため部分索引を張る。
-- =============================================================

create index concurrently if not exists idx_market_deals_trade_in_vehicle
  on market_deals (trade_in_vehicle_id)
  where trade_in_vehicle_id is not null;
