-- =============================================================
-- Service Packages (Canned Jobs)
-- 競合分析 P0-3 (Shop-Ware/Shopmonkey) に基づく品目バンドル機能。
-- 「セラミックコーティング Lv2 標準」「PPF フルボディ標準」のような
-- 施工テンプレートを 1 クリックで案件・見積・証明書フォームに展開する。
-- =============================================================

-- 1) service_packages: バンドル定義 (テナント別)
CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  price_strategy text NOT NULL DEFAULT 'sum_of_items',
  fixed_price integer,
  recommended_template_id uuid REFERENCES templates (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_packages_category_check
    CHECK (category IN ('coating', 'ppf', 'detailing', 'maintenance', 'body_repair', 'general')),
  CONSTRAINT service_packages_price_strategy_check
    CHECK (price_strategy IN ('sum_of_items', 'fixed', 'manual')),
  CONSTRAINT service_packages_fixed_price_required
    CHECK (price_strategy <> 'fixed' OR fixed_price IS NOT NULL)
);

COMMENT ON TABLE service_packages IS
  '施工テンプレート (Canned Jobs)。menu_items のバンドルを 1 クリックで展開する。';
COMMENT ON COLUMN service_packages.category IS
  'coating | ppf | detailing | maintenance | body_repair | general';
COMMENT ON COLUMN service_packages.price_strategy IS
  'sum_of_items=明細合計 / fixed=固定価格(fixed_price 必須) / manual=展開後に手入力';
COMMENT ON COLUMN service_packages.recommended_template_id IS
  '証明書発行時に自動で選ばれる推奨レイアウトテンプレ (templates 表)';

CREATE INDEX IF NOT EXISTS idx_service_packages_tenant
  ON service_packages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_active
  ON service_packages (tenant_id, is_archived, sort_order);
CREATE INDEX IF NOT EXISTS idx_service_packages_category
  ON service_packages (tenant_id, category) WHERE is_archived = false;

-- updated_at トリガ (他テーブルと同様)
CREATE OR REPLACE FUNCTION trg_service_packages_updated_at_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_packages_updated_at ON service_packages;
CREATE TRIGGER trg_service_packages_updated_at
  BEFORE UPDATE ON service_packages
  FOR EACH ROW
  EXECUTE FUNCTION trg_service_packages_updated_at_fn();

-- 2) service_package_items: バンドルに含まれる menu_items の参照
CREATE TABLE IF NOT EXISTS service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES service_packages (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  quantity numeric(10, 2) NOT NULL DEFAULT 1,
  override_unit_price integer,
  is_archived boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_package_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT service_package_items_override_nonneg
    CHECK (override_unit_price IS NULL OR override_unit_price >= 0)
);

COMMENT ON TABLE service_package_items IS
  'service_packages の明細。menu_items に紐付き、quantity と任意の単価上書きを保持。';
COMMENT ON COLUMN service_package_items.override_unit_price IS
  'NULL の場合は expand 時に menu_items.unit_price をスナップショット。値があるとパッケージ固有の単価を使う。';
COMMENT ON COLUMN service_package_items.tenant_id IS
  'package_id から導出可能だが、RLS チェックを単純に保つために冗長保持。';

CREATE INDEX IF NOT EXISTS idx_service_package_items_package
  ON service_package_items (package_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_service_package_items_tenant
  ON service_package_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_package_items_menu_item
  ON service_package_items (menu_item_id);

-- 3) RLS: 既存 _v2 ポリシー命名と my_tenant_ids() / my_tenant_role() に合わせる
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_packages_select_v2 ON service_packages;
DROP POLICY IF EXISTS service_packages_insert_v2 ON service_packages;
DROP POLICY IF EXISTS service_packages_update_v2 ON service_packages;
DROP POLICY IF EXISTS service_packages_delete_v2 ON service_packages;

CREATE POLICY service_packages_select_v2 ON service_packages
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY service_packages_insert_v2 ON service_packages
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY service_packages_update_v2 ON service_packages
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY service_packages_delete_v2 ON service_packages
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

ALTER TABLE service_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_package_items_select_v2 ON service_package_items;
DROP POLICY IF EXISTS service_package_items_insert_v2 ON service_package_items;
DROP POLICY IF EXISTS service_package_items_update_v2 ON service_package_items;
DROP POLICY IF EXISTS service_package_items_delete_v2 ON service_package_items;

CREATE POLICY service_package_items_select_v2 ON service_package_items
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY service_package_items_insert_v2 ON service_package_items
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY service_package_items_update_v2 ON service_package_items
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY service_package_items_delete_v2 ON service_package_items
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
