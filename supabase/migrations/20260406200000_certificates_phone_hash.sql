-- certificates テーブルに顧客電話番号ハッシュカラムを追加
-- /api/certificates/create および顧客マイページの証明書紐づけに必要

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS customer_phone_last4      text,
  ADD COLUMN IF NOT EXISTS customer_phone_last4_hash text;

COMMENT ON COLUMN certificates.customer_phone_last4      IS '電話番号下4桁（平文）— 旧データ互換用';
COMMENT ON COLUMN certificates.customer_phone_last4_hash IS 'sha256(v1|tenant_id|last4|PEPPER) — 顧客マイページ紐づけ用';

CREATE INDEX IF NOT EXISTS idx_certificates_phone_hash
  ON certificates (tenant_id, customer_phone_last4_hash)
  WHERE customer_phone_last4_hash IS NOT NULL;
