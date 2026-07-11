-- =============================================================
-- tenant_line_knowledge: LINE 自動返信用の店舗ナレッジ (Q&A / 営業情報)
--
-- テナントが「AI に学習させたい」知識 (営業時間・定休日・駐車場・
-- 対応可否・支払い方法など) を登録し、LINE 公式アカウントの受信
-- メッセージに対する AI 自動返信 (inbound_message.auto_reply_knowledge,
-- opt-in / 既定 OFF) の回答ソースにする。
--
-- AI はここに登録された内容 **のみ** から回答する (ナレッジ外は
-- 回答せずスタッフ対応に残す) ため、内容の正確性はテナント管理者が
-- 担保する。編集は admin 以上 (API 側で強制)。
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant_line_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  -- 質問 / トピック (例: "営業時間を教えて")
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- 回答 / 知識本文 (例: "平日 9:00〜18:00、日曜定休です。")
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  -- false にすると AI の回答ソースから外れる (削除せず一時停止できる)
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_line_knowledge IS
  'LINE 自動返信 (auto_reply_knowledge) の回答ソースになる店舗ナレッジ。AI はこの内容のみから回答する。';

CREATE INDEX IF NOT EXISTS idx_tenant_line_knowledge_tenant
  ON tenant_line_knowledge (tenant_id, enabled, created_at);

-- updated_at は共有トリガで自動更新 (core_tables の set_updated_at())
DROP TRIGGER IF EXISTS trg_tenant_line_knowledge_updated_at ON tenant_line_knowledge;
CREATE TRIGGER trg_tenant_line_knowledge_updated_at
  BEFORE UPDATE ON tenant_line_knowledge
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: 参照はテナントメンバー、書き込みは owner/admin のみ
-- (自動返信の回答内容を直接左右するため staff には書かせない)
ALTER TABLE tenant_line_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_line_knowledge_select ON tenant_line_knowledge;
DROP POLICY IF EXISTS tenant_line_knowledge_insert ON tenant_line_knowledge;
DROP POLICY IF EXISTS tenant_line_knowledge_update ON tenant_line_knowledge;
DROP POLICY IF EXISTS tenant_line_knowledge_delete ON tenant_line_knowledge;

CREATE POLICY tenant_line_knowledge_select ON tenant_line_knowledge
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY tenant_line_knowledge_insert ON tenant_line_knowledge
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY tenant_line_knowledge_update ON tenant_line_knowledge
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY tenant_line_knowledge_delete ON tenant_line_knowledge
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
