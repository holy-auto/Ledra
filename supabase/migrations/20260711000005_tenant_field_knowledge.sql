-- =============================================================
-- tenant_field_knowledge: 現場スタッフ向け「店舗ナレッジ」(施工の勘所)
--
-- 顧客向けの LINE 自動返信ナレッジ (tenant_line_knowledge) とは別に、技術者が
-- 施工の注意点・車種別メモ・配線ルート・クレーム事例などを登録し、スタッフが
-- AI に質問して登録内容から回答を得る (field-knowledge/ask) ためのテーブル。
--
-- line_knowledge との違い:
--   - 書き込みを **staff 以上** に許可する (現場の技術者が知見を足せる。roadmap
--     4-13 の意図)。line_knowledge は顧客への外向き返信ソースなので admin 限定。
--   - vehicle_model / tags を任意で持たせ、後日の絞り込みに使えるようにする。
--
-- AI はここに登録された内容 **のみ** から回答する (ナレッジ外は「確認が必要」)。
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant_field_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  -- 質問 / トピック (例: "30アルファードの前後ドラレコ取付")
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- 知識本文 (例: "左Aピラー内の配線でクリップ破損注意。リアゲート蛇腹通しに時間。")
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  -- 任意: 対象車種 (絞り込み・表示用)
  vehicle_model text CHECK (vehicle_model IS NULL OR char_length(vehicle_model) <= 100),
  -- 任意: タグ (施工種別など)
  tags text[] NOT NULL DEFAULT '{}',
  -- false にすると AI の回答ソースから外れる (削除せず一時停止できる)
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_field_knowledge IS
  '現場スタッフ向けの施工ナレッジ。field-knowledge/ask の AI 回答ソース。書込は staff 以上。';

CREATE INDEX IF NOT EXISTS idx_tenant_field_knowledge_tenant
  ON tenant_field_knowledge (tenant_id, enabled, created_at);

-- updated_at は共有トリガで自動更新 (core_tables の set_updated_at())
DROP TRIGGER IF EXISTS trg_tenant_field_knowledge_updated_at ON tenant_field_knowledge;
CREATE TRIGGER trg_tenant_field_knowledge_updated_at
  BEFORE UPDATE ON tenant_field_knowledge
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: 参照・書き込みともテナントメンバー (staff 以上)。
-- line_knowledge と違い staff にも書かせる (現場技術者が知見を足せるように)。
ALTER TABLE tenant_field_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_field_knowledge_select ON tenant_field_knowledge;
DROP POLICY IF EXISTS tenant_field_knowledge_insert ON tenant_field_knowledge;
DROP POLICY IF EXISTS tenant_field_knowledge_update ON tenant_field_knowledge;
DROP POLICY IF EXISTS tenant_field_knowledge_delete ON tenant_field_knowledge;

CREATE POLICY tenant_field_knowledge_select ON tenant_field_knowledge
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY tenant_field_knowledge_insert ON tenant_field_knowledge
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY tenant_field_knowledge_update ON tenant_field_knowledge
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY tenant_field_knowledge_delete ON tenant_field_knowledge
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );
