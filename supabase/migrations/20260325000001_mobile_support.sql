-- =============================================================================
-- Mobile App Support Migration
-- Adds audit_logs, push_tokens tables and extends existing tables
-- for CARTRUST mobile app (Expo/React Native)
-- =============================================================================

-- 1. 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  reason text,
  performed_by uuid REFERENCES auth.users(id),
  device_id text,
  ip_address text,
  performed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS performed_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
  ON audit_logs(tenant_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record
  ON audit_logs(table_name, record_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_read" ON audit_logs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY "audit_logs_tenant_insert" ON audit_logs
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));


-- 2. プッシュ通知トークンテーブル
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_own" ON push_tokens
  FOR ALL USING (user_id = auth.uid());


-- 3. 予約テーブル拡張
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS sub_status text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS progress_note text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS estimated_minutes integer;


-- 4. 決済テーブル拡張: 冪等性キー
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;


-- 5a. 顧客テーブル: line_user_id(防御的追加)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS line_user_id text;

-- 5b. 予約テーブル: line_user_id, gcal_event_id, source(防御的追加)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS line_user_id text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS gcal_event_id text;

-- 5c. 車両履歴テーブル拡張: performed_at(防御的追加) + 顧客公開フラグ
ALTER TABLE vehicle_histories ADD COLUMN IF NOT EXISTS performed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE vehicle_histories ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
ALTER TABLE vehicle_histories ADD COLUMN IF NOT EXISTS progress_label text;


-- 6. メニューアイテム拡張: 所要時間
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS estimated_minutes integer;


-- 7. 証明書テーブル拡張: 再施工リンク
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS parent_certificate_id uuid REFERENCES certificates(id);


-- 8. 店舗テーブル拡張: キャパシティ
ALTER TABLE stores ADD COLUMN IF NOT EXISTS capacity integer DEFAULT 1;


-- 9. 予約のインデックス追加（モバイルカレンダー検索用）
CREATE INDEX IF NOT EXISTS idx_reservations_date_tenant
  ON reservations(tenant_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_reservations_store_status
  ON reservations(store_id, status) WHERE store_id IS NOT NULL;


-- 10. 証明書のステータス別検索インデックス
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_status
  ON certificates(tenant_id, status);


-- 11. NFCタグの証明書リンク検索インデックス
CREATE INDEX IF NOT EXISTS idx_nfc_tags_certificate
  ON nfc_tags(certificate_id) WHERE certificate_id IS NOT NULL;

-- 12. NFCタグのアクティブ証明書一意制約
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfc_active_certificate
  ON nfc_tags(certificate_id)
  WHERE status IN ('written', 'attached') AND certificate_id IS NOT NULL;
