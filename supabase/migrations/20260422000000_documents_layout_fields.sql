-- =============================================================
-- Documents: Add layout-related fields (Phase 1 / A plan)
--  - Extended recipient info (address/phone/postal code/honorific)
--  - Subject, period, payment terms, delivery date
--  - Per-document template override
-- =============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS subject text;
COMMENT ON COLUMN documents.subject IS '件名';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS period_start date;
COMMENT ON COLUMN documents.period_start IS '期間（開始）';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS period_end date;
COMMENT ON COLUMN documents.period_end IS '期間（終了）';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS payment_terms text;
COMMENT ON COLUMN documents.payment_terms IS '支払条件';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS delivery_date date;
COMMENT ON COLUMN documents.delivery_date IS '納期日';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient_postal_code text;
COMMENT ON COLUMN documents.recipient_postal_code IS '宛先 郵便番号';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient_address text;
COMMENT ON COLUMN documents.recipient_address IS '宛先 住所';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient_phone text;
COMMENT ON COLUMN documents.recipient_phone IS '宛先 電話番号';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient_honorific text NOT NULL DEFAULT '御中'
  CHECK (recipient_honorific IN ('御中', '様', ''));
COMMENT ON COLUMN documents.recipient_honorific IS '宛名敬称 (御中/様/空)';
