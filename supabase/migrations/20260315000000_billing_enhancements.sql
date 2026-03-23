-- =============================================================
-- Billing Enhancements: payment_date, notification_logs
-- =============================================================

-- ① 請求書に支払日カラム追加
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date date;
COMMENT ON COLUMN invoices.payment_date IS '入金日';

-- ② 通知ログテーブル（リマインダー・フォロー共用）
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,           -- 'overdue_reminder', 'due_soon', 'follow_up', 'expiry_reminder'
  target_type text NOT NULL,    -- 'invoice', 'certificate'
  target_id uuid NOT NULL,
  recipient_email text,
  sent_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'sent'  -- 'sent', 'failed'
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_tenant ON notification_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_target ON notification_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(tenant_id, type);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_logs_tenant_select ON notification_logs;
CREATE POLICY notification_logs_tenant_select ON notification_logs
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS notification_logs_tenant_insert ON notification_logs;
CREATE POLICY notification_logs_tenant_insert ON notification_logs
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );
