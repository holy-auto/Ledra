-- 証明書テーブルに電話番号下4桁フィールドを追加
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS customer_phone_last4      text,
  ADD COLUMN IF NOT EXISTS customer_phone_last4_hash text;

COMMENT ON COLUMN certificates.customer_phone_last4 IS '顧客電話番号の下4桁（平文）。ポータルログイン照合用。';
COMMENT ON COLUMN certificates.customer_phone_last4_hash IS '顧客電話番号下4桁のSHA-256ハッシュ（テナント＋PEPPER付き）。検索用。';

CREATE INDEX IF NOT EXISTS idx_certificates_phone_hash
  ON certificates (tenant_id, customer_phone_last4_hash)
  WHERE customer_phone_last4_hash IS NOT NULL;
