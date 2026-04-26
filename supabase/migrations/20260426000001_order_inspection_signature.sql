-- 検収電子署名カラムの追加
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS inspection_signature_data_url text,
  ADD COLUMN IF NOT EXISTS inspection_signed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS inspection_signer_name        text;

COMMENT ON COLUMN job_orders.inspection_signature_data_url IS '検収時の手書きサイン（base64 PNG data URL）';
COMMENT ON COLUMN job_orders.inspection_signed_at          IS '検収サイン完了日時';
COMMENT ON COLUMN job_orders.inspection_signer_name        IS '検収サイン者名';
