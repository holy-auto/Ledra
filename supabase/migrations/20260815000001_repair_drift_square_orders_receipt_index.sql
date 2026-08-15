-- =============================================================
-- re-apply: 20260710000002_square_orders_receipt_link_index.sql
--
-- 20260815000000 のドリフト修復の続き。receipt_document_id の索引は
-- CREATE INDEX CONCURRENTLY がトランザクション内で実行できないため、
-- 元ファイルと同じく単独のマイグレーションに分ける。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_square_orders_receipt_document
  ON square_orders(receipt_document_id);
