-- =============================================================
-- square_orders.receipt_document_id — lookup index (CONCURRENTLY)
--
-- Companion to 20260710000001 (receipt link column). Split into its
-- own file because CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction.
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_square_orders_receipt_document
  ON square_orders(receipt_document_id);
