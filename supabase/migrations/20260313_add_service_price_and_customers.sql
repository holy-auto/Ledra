-- ③ 施工料金フィールド追加
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS service_price integer;
COMMENT ON COLUMN certificates.service_price IS '施工料金（円）。当事者のみ閲覧可。';

-- ④ 顧客管理テーブル
CREATE TABLE IF NOT EXISTS customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_kana text,
  email text,
  phone text,
  postal_code text,
  address text,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(tenant_id, name);

-- 証明書と顧客の紐付け
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_certificates_customer ON certificates(customer_id);

-- RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_tenant_select ON customers;
CREATE POLICY customers_tenant_select ON customers
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS customers_tenant_insert ON customers;
CREATE POLICY customers_tenant_insert ON customers
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS customers_tenant_update ON customers;
CREATE POLICY customers_tenant_update ON customers
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS customers_tenant_delete ON customers;
CREATE POLICY customers_tenant_delete ON customers
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- ⑤ 請求書テーブル
CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  invoice_number text NOT NULL,
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
  subtotal integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  note text,
  items_json jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_tenant_select ON invoices;
CREATE POLICY invoices_tenant_select ON invoices
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS invoices_tenant_insert ON invoices;
CREATE POLICY invoices_tenant_insert ON invoices
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS invoices_tenant_update ON invoices;
CREATE POLICY invoices_tenant_update ON invoices
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS invoices_tenant_delete ON invoices;
CREATE POLICY invoices_tenant_delete ON invoices
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );
