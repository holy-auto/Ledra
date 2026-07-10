-- ============================================================
-- Square 売上から作成した領収書 (documents) へのリンクを追加
-- ============================================================

ALTER TABLE square_orders
  ADD COLUMN IF NOT EXISTS receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_square_orders_receipt_document ON square_orders(receipt_document_id);
