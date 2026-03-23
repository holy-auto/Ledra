-- =============================================================
-- Customer Portal tables: OTP login codes and sessions
-- Used by customerPortalServer.ts for customer authentication
-- =============================================================

-- ─── customer_login_codes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_login_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email           text NOT NULL,
  phone_last4_hash text NOT NULL,
  code_hash       text NOT NULL,
  attempts        integer NOT NULL DEFAULT 0,
  used_at         timestamptz,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_login_codes ENABLE ROW LEVEL SECURITY;

-- Service role only (no direct user access)
CREATE POLICY "customer_login_codes_service_only" ON customer_login_codes
  FOR ALL
  USING (false);

-- Index for lookup by tenant + email + expiry (matching existing performance index)
CREATE INDEX IF NOT EXISTS idx_customer_login_codes_tenant_email
  ON customer_login_codes (tenant_id, email, expires_at DESC);

-- ─── customer_sessions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email           text NOT NULL,
  phone_last4_hash text NOT NULL,
  phone_last4_plain text,
  session_hash    text NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- Service role only (no direct user access)
CREATE POLICY "customer_sessions_service_only" ON customer_sessions
  FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_tenant_hash
  ON customer_sessions (tenant_id, session_hash);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires
  ON customer_sessions (expires_at)
  WHERE revoked_at IS NULL;
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
-- Remove customer contact fields from vehicles and add VIN/chassis number
-- customer data belongs in the customers table, not vehicles

ALTER TABLE vehicles
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS customer_email,
  DROP COLUMN IF EXISTS customer_phone_masked,
  ADD COLUMN IF NOT EXISTS vin_code text;

COMMENT ON COLUMN vehicles.vin_code IS '車体番号（VINコード）— 車検証に記載の17桁英数字';

CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles (tenant_id, vin_code)
  WHERE vin_code IS NOT NULL;
