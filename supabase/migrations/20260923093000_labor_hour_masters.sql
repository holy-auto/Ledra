-- =============================================================
-- 型式 × 品番 の取付工数マスタ ＋ 店舗（支店）別の時間単価
--
-- 背景: ディーラー等の発注書から工賃を出すとき、同じ品番でも型式（車種）で工数が
--   変わる。menu_items.labor_hours は品目単位で型式の軸が無いため、(型式, 品番) を
--   キーにした別表を持つ。算出は src/lib/pricing/laborMaster.ts（AI を使わない）:
--     工賃 = 工数(h) × 時間単価(円/h)   または 定額（ETCセットアップ等）
--   時間単価は 支店 customer_branches.labor_rate_per_hour → 自社 tenants.labor_rate_per_hour の順。
--
--   model_code : 型式（正規化済み・大文字・ハイフン無し）。'*' = 型式共通
--   part_key   : 照合キー（品番、品番の無い作業は作業名。NFKC・大文字・空白/ハイフン除去）
--   part_number: 登録時の原文（表示用）
--   hours / fixed_price: どちらか必須。0h = 本体取付に含まれる部品
-- =============================================================

CREATE TABLE IF NOT EXISTS labor_hour_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_code text NOT NULL CHECK (length(model_code) BETWEEN 1 AND 20),
  part_key text NOT NULL CHECK (length(part_key) BETWEEN 1 AND 100),
  part_number text NOT NULL CHECK (length(part_number) <= 100),
  label text CHECK (length(label) <= 200),
  hours numeric(6, 2) CHECK (hours >= 0),
  fixed_price integer CHECK (fixed_price >= 0),
  source_url text CHECK (length(source_url) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT labor_hour_masters_value_chk CHECK (hours IS NOT NULL OR fixed_price IS NOT NULL),
  CONSTRAINT labor_hour_masters_key_uniq UNIQUE (tenant_id, model_code, part_key)
);

ALTER TABLE labor_hour_masters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_hour_masters_tenant_select ON labor_hour_masters;
CREATE POLICY labor_hour_masters_tenant_select ON labor_hour_masters
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS labor_hour_masters_tenant_insert ON labor_hour_masters;
CREATE POLICY labor_hour_masters_tenant_insert ON labor_hour_masters
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS labor_hour_masters_tenant_update ON labor_hour_masters;
CREATE POLICY labor_hour_masters_tenant_update ON labor_hour_masters
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS labor_hour_masters_tenant_delete ON labor_hour_masters;
CREATE POLICY labor_hour_masters_tenant_delete ON labor_hour_masters
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

COMMENT ON TABLE labor_hour_masters IS
  '型式 × 品番（作業名）の取付工数マスタ。工賃 = 工数 × 店舗時間単価、または定額。';

ALTER TABLE customer_branches
  ADD COLUMN IF NOT EXISTS labor_rate_per_hour integer CHECK (labor_rate_per_hour > 0);

COMMENT ON COLUMN customer_branches.labor_rate_per_hour IS
  '支店（取引先店舗）ごとの工賃時間単価 (円/時、税抜)。NULL = 自社の tenants.labor_rate_per_hour を使う。';
