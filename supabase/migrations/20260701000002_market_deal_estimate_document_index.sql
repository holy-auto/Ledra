-- =============================================================
-- market_deals.estimate_document_id の FK covering index (CONCURRENTLY)
--
-- Companion to 20260701000001 (カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- 見積ドキュメント削除時の on delete set null / 逆引き lookup のため部分索引を張る。
-- =============================================================

create index concurrently if not exists idx_market_deals_estimate_doc
  on market_deals (estimate_document_id)
  where estimate_document_id is not null;
