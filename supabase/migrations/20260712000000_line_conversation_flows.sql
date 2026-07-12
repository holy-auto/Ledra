-- =============================================================
-- line_conversation_flows: LINE 会話フローの状態機械 (state machine)
--
-- 見積り問い合わせ → (登録) → 詳細収集 → 見積り提示 → 可否 → 日程調整 …
-- という複数ターンにまたがる会話を「状態」として保持し、顧客の OK/NG や
-- ボタン選択で分岐を進めるための土台 (設計書:
-- docs/internal/line-conversational-flow-design-2026-07.md)。
--
-- 1 スレッド (顧客 or 未紐付け LINE ユーザー) につき進行中フローは 1 本。
-- 書き込みは webhook (auth セッション無し) からも行うため service-role 経由。
-- =============================================================

CREATE TABLE IF NOT EXISTS line_conversation_flows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers (id) ON DELETE SET NULL,
  line_user_id    text,
  -- 状態 (states.ts の FlowState と一致)。自由 text で持ち、アプリ側で検証する
  -- (enum 型にすると状態追加のたびに migration が要るため)。
  state           text NOT NULL,
  -- 進行中の文脈 (見積り doc_id・選択オプション・提示スロット等)。
  context_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  reservation_id  uuid REFERENCES reservations (id) ON DELETE SET NULL,
  quote_doc_id    uuid REFERENCES documents (id) ON DELETE SET NULL,
  invoice_doc_id  uuid REFERENCES documents (id) ON DELETE SET NULL,
  last_message_id uuid REFERENCES customer_messages (id) ON DELETE SET NULL,
  -- 放置フローの失効期限 (既定 72h)。過ぎたらスタッフ引き継ぎにする。
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_conversation_flows_thread_key CHECK (customer_id IS NOT NULL OR line_user_id IS NOT NULL)
);

COMMENT ON TABLE line_conversation_flows IS
  'LINE 会話フローの状態機械。1 スレッド 1 進行中フロー。webhook から service-role で更新。';

-- 進行中 (= 終端でない) フローの索引。スレッドキーごとの現行フロー検索に使う。
CREATE INDEX IF NOT EXISTS idx_line_flows_active_by_customer
  ON line_conversation_flows (tenant_id, customer_id, updated_at DESC)
  WHERE customer_id IS NOT NULL AND state NOT IN ('closed', 'expired');
CREATE INDEX IF NOT EXISTS idx_line_flows_active_by_line_user
  ON line_conversation_flows (tenant_id, line_user_id, updated_at DESC)
  WHERE line_user_id IS NOT NULL AND state NOT IN ('closed', 'expired');

-- 失効 cron 用: 進行中で期限切れの行を引く。
CREATE INDEX IF NOT EXISTS idx_line_flows_expiry
  ON line_conversation_flows (expires_at)
  WHERE state NOT IN ('closed', 'expired');

-- 1 スレッド 1 進行中フローを担保 (顧客紐付けありは customer_id 単位で一意)。
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_flows_active_customer
  ON line_conversation_flows (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL AND state NOT IN ('closed', 'expired');
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_flows_active_line_user
  ON line_conversation_flows (tenant_id, line_user_id)
  WHERE customer_id IS NULL AND line_user_id IS NOT NULL AND state NOT IN ('closed', 'expired');

-- updated_at 自動更新 (core_tables の共有トリガ)。
DROP TRIGGER IF EXISTS trg_line_conversation_flows_updated_at ON line_conversation_flows;
CREATE TRIGGER trg_line_conversation_flows_updated_at
  BEFORE UPDATE ON line_conversation_flows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: テナントメンバー参照 / 書き込みは service-role (webhook)。
ALTER TABLE line_conversation_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS line_conversation_flows_select ON line_conversation_flows;
CREATE POLICY line_conversation_flows_select ON line_conversation_flows
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
