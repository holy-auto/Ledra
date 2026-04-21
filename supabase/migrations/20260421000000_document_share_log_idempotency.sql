-- Add idempotency_key to document_share_log for duplicate send prevention
ALTER TABLE document_share_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_doc_share_log_idempotency
  ON document_share_log(idempotency_key, channel)
  WHERE idempotency_key IS NOT NULL AND status = 'sent';

COMMENT ON COLUMN document_share_log.idempotency_key IS '二重送信防止キー（クライアント生成UUID）';
