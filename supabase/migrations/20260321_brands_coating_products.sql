-- Brands and coating products master tables
-- Platform-common rows have tenant_id = NULL (visible to all tenants, read-only)
-- Tenant-specific rows have tenant_id set (full CRUD by that tenant)

CREATE TABLE IF NOT EXISTS brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  website_url text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_tenant ON brands (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS coating_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  product_code text,
  description  text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coating_products_brand ON coating_products (brand_id);
CREATE INDEX IF NOT EXISTS idx_coating_products_tenant ON coating_products (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE coating_products ENABLE ROW LEVEL SECURITY;

-- brands: platform-common (tenant_id IS NULL) visible to all authenticated users
-- tenant-specific rows visible only to that tenant
CREATE POLICY "brands_select" ON brands
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT my_tenant_ids())
  );

-- Only tenant members can insert/update/delete their own brands
CREATE POLICY "brands_insert" ON brands
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "brands_update" ON brands
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "brands_delete" ON brands
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

-- coating_products: same pattern
CREATE POLICY "coating_products_select" ON coating_products
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "coating_products_insert" ON coating_products
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "coating_products_update" ON coating_products
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "coating_products_delete" ON coating_products
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

-- updated_at triggers (reuse existing set_updated_at function)
CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_coating_products_updated_at
  BEFORE UPDATE ON coating_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add coating_products_json to certificates
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS coating_products_json jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN certificates.coating_products_json IS
  '施工箇所ごとのコーティング剤情報。[{location, brand_id, brand_name, product_id, product_name}]';
