-- =============================================================
-- Enhance Documents: menu_items, bank_info, invoice columns
-- =============================================================

-- ① 品目マスタ（メニュー表）
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  unit_price integer NOT NULL DEFAULT 0,
  tax_category integer NOT NULL DEFAULT 10,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_tenant ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(tenant_id, is_active);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_items_tenant_select ON menu_items;
CREATE POLICY menu_items_tenant_select ON menu_items
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS menu_items_tenant_insert ON menu_items;
CREATE POLICY menu_items_tenant_insert ON menu_items
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS menu_items_tenant_update ON menu_items;
CREATE POLICY menu_items_tenant_update ON menu_items
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS menu_items_tenant_delete ON menu_items;
CREATE POLICY menu_items_tenant_delete ON menu_items
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- ② テナントに口座情報追加
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_info jsonb DEFAULT '{}';
COMMENT ON COLUMN tenants.bank_info IS '振込先口座情報 {bank_name, branch_name, account_type, account_number, account_holder}';

-- ③ documents テーブルに宛先店舗名・口座表示フラグ追加
ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS show_bank_info boolean NOT NULL DEFAULT false;

-- ④ invoices テーブルにインボイス・角印・口座対応カラム追加
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_invoice_compliant boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_seal boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_logo boolean NOT NULL DEFAULT true;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_bank_info boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate integer NOT NULL DEFAULT 10;
