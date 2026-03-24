-- =============================================================
-- chat_messages: 受発注に紐づくチャット
-- 1 job_order = 1 スレッド（chat_threads テーブル不要）
-- from/to_tenant_id を冗長保持して RLS の JOIN を回避
-- =============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id     uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  sender_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 冗長保持（RLS 高速化のため）
  from_tenant_id   uuid NOT NULL,
  to_tenant_id     uuid NOT NULL,
  body             text NOT NULL,
  attachment_path  text,
  attachment_type  text,
  is_system        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: 取引関係テナントのみ
CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT
  USING (
    from_tenant_id IN (SELECT my_tenant_ids())
    OR to_tenant_id IN (SELECT my_tenant_ids())
  );

-- INSERT: 取引関係テナントの staff 以上
CREATE POLICY "chat_messages_insert" ON chat_messages FOR INSERT
  WITH CHECK (
    sender_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(sender_tenant_id) IN ('owner','admin','staff')
    AND (from_tenant_id IN (SELECT my_tenant_ids()) OR to_tenant_id IN (SELECT my_tenant_ids()))
  );

-- インデックス
CREATE INDEX IF NOT EXISTS idx_chat_messages_order ON chat_messages(job_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(from_tenant_id, to_tenant_id);

-- Supabase Realtime 有効化
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
