-- =============================================================
-- global_line_knowledge: LINE 自動返信用の全テナント共有ナレッジ
--
-- 運営 (プラットフォーム) が登録し、全テナントの LINE AI 自動返信
-- (inbound_message.auto_reply_knowledge) が共通の回答ソースとして参照する。
-- 例: コーティング・車検・保険の一般知識など、店舗に依らない内容。
--
-- テナント個別の tenant_line_knowledge と併用され、内容が矛盾する場合は
-- 店舗ナレッジが優先される (プロンプト側で強制)。
-- 書き込みは運営 (super admin) のみ。
-- =============================================================

CREATE TABLE IF NOT EXISTS global_line_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE global_line_knowledge IS
  'LINE 自動返信の全テナント共有ナレッジ (運営管理)。tenant_line_knowledge と併用され、矛盾時は店舗側が優先。';

CREATE INDEX IF NOT EXISTS idx_global_line_knowledge_enabled
  ON global_line_knowledge (enabled, created_at);

-- updated_at は共有トリガで自動更新 (core_tables の set_updated_at())
DROP TRIGGER IF EXISTS trg_global_line_knowledge_updated_at ON global_line_knowledge;
CREATE TRIGGER trg_global_line_knowledge_updated_at
  BEFORE UPDATE ON global_line_knowledge
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE global_line_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_line_knowledge_select ON global_line_knowledge;
DROP POLICY IF EXISTS global_line_knowledge_write ON global_line_knowledge;

-- 全認証ユーザーが閲覧可 (テナント管理画面から「共通で何が答えられるか」を確認できる)
CREATE POLICY global_line_knowledge_select ON global_line_knowledge
  FOR SELECT TO authenticated USING (true);

-- 書き込みは運営 (super admin) のみ
CREATE POLICY global_line_knowledge_write ON global_line_knowledge
  FOR ALL USING (is_super_admin_user()) WITH CHECK (is_super_admin_user());
