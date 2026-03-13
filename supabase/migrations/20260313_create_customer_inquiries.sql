-- 1. customer_inquiries テーブル
CREATE TABLE IF NOT EXISTS customer_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  certificate_id  uuid REFERENCES certificates(id) ON DELETE SET NULL,
  public_id       text,
  sender_name     text NOT NULL,
  sender_email    text,
  sender_phone    text,
  body            text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  admin_notes     text,
  replied_at      timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ci_tenant_status ON customer_inquiries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ci_created_at ON customer_inquiries(created_at DESC);
ALTER TABLE customer_inquiries ENABLE ROW LEVEL SECURITY;

-- 2. tenants テーブルに連絡先カラム追加
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_line  text,
  ADD COLUMN IF NOT EXISTS contact_note  text;
