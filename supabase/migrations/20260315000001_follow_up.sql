-- Follow-up automation: expiry_date on certificates + follow_up_settings table

-- 証明書に有効期限日を追加（クエリ用）
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS expiry_date date;
COMMENT ON COLUMN certificates.expiry_date IS '有効期限日。expiry_type/expiry_value から算出';

-- フォロー設定テーブル
CREATE TABLE IF NOT EXISTS follow_up_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_days_before integer[] DEFAULT '{30,7,1}',
  follow_up_days_after integer[] DEFAULT '{90,180}',
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- RLS
ALTER TABLE follow_up_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_up_settings_tenant_read"
  ON follow_up_settings FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

CREATE POLICY "follow_up_settings_tenant_write"
  ON follow_up_settings FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

-- Index
CREATE INDEX IF NOT EXISTS idx_certificates_expiry_date ON certificates(tenant_id, expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_settings_tenant ON follow_up_settings(tenant_id);

-- Trigger
CREATE TRIGGER set_follow_up_settings_updated_at
  BEFORE UPDATE ON follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
