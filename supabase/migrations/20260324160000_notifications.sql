-- =============================================================
-- notifications: in-app 通知
-- 初期は全通知デフォルト ON、preferences テーブルは不要
-- =============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- null = テナント全員
  notification_type text NOT NULL,
  -- order_created, order_accepted, order_completed, order_cancelled,
  -- payment_confirmed, chat_message, rating_request, rating_received
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal')),
  title             text NOT NULL,
  body              text,
  link_path         text,             -- /admin/orders/{id} 等
  job_order_id      uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: 自テナント宛 & (全員向け or 自分向け)
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- UPDATE: 既読マーク用
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- INSERT: サービスロールのみ（API / Edge Function 経由）
-- authenticated ユーザーが直接INSERTすることはない

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread
  ON notifications(tenant_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Supabase Realtime 有効化（in-app 通知のリアルタイム配信）
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
