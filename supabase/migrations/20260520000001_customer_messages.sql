-- =============================================================
-- customer_messages: 顧客双方向メッセージスレッド
-- LINE Webhook で受信した顧客発のメッセージと、管理画面から
-- 顧客に Push 送信したメッセージを 1 つのスレッドとして時系列に保存する。
-- 顧客 360° ビュー (`/admin/customers/[id]`) のメッセージタブで表示する。
--
-- direction:
--   inbound  = 顧客 → 店舗 (LINE Webhook 経由)
--   outbound = 店舗 → 顧客 (admin UI / 自動通知)
-- channel: 当面 'line' のみ。将来 'sms' / 'email' を追加できるよう text で持つ。
-- customer_id: LINE Bot 友だち追加直後など、まだ customers と紐付かない場合は
--              NULL のまま保存し、後で line_user_id で紐付ける。
-- =============================================================

CREATE TABLE IF NOT EXISTS customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  line_user_id text,
  channel text NOT NULL DEFAULT 'line',
  direction text NOT NULL,
  body text NOT NULL,
  raw_event jsonb,
  sent_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  line_message_id text,
  line_timestamp_ms bigint,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_messages_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT customer_messages_channel_check CHECK (channel IN ('line', 'sms', 'email'))
);

COMMENT ON TABLE customer_messages IS
  '顧客との双方向メッセージスレッド。LINE 受信 / 管理画面送信を 1 表で保持。';
COMMENT ON COLUMN customer_messages.customer_id IS
  'customers との関連。inbound 時は line_user_id でマッチした顧客があれば自動でセット、無ければ NULL。';
COMMENT ON COLUMN customer_messages.line_user_id IS
  '送信元 / 送信先の LINE userId。customer_id が無くてもスレッドを成立させるために保持。';
COMMENT ON COLUMN customer_messages.raw_event IS
  'LINE Webhook の元イベント JSON (デバッグ・将来の再処理用)。';

CREATE INDEX IF NOT EXISTS idx_customer_messages_thread_by_customer
  ON customer_messages (tenant_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_messages_thread_by_line_user
  ON customer_messages (tenant_id, line_user_id, created_at DESC)
  WHERE line_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_messages_unmatched
  ON customer_messages (tenant_id, created_at DESC)
  WHERE customer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_messages_line_message_id
  ON customer_messages (line_message_id)
  WHERE line_message_id IS NOT NULL;

-- RLS: テナント所属メンバーだけが参照・操作可能
ALTER TABLE customer_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_messages_select_v2 ON customer_messages;
DROP POLICY IF EXISTS customer_messages_insert_v2 ON customer_messages;
DROP POLICY IF EXISTS customer_messages_update_v2 ON customer_messages;
DROP POLICY IF EXISTS customer_messages_delete_v2 ON customer_messages;

CREATE POLICY customer_messages_select_v2 ON customer_messages
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY customer_messages_insert_v2 ON customer_messages
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY customer_messages_update_v2 ON customer_messages
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY customer_messages_delete_v2 ON customer_messages
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
