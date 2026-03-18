-- Multi-store (multi-branch) support
-- stores belong to a tenant, members can be assigned to specific stores

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  email text,
  manager_name text,
  business_hours jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_tenant ON stores(tenant_id);

-- Member-store assignment (which members can access which stores)
CREATE TABLE IF NOT EXISTS store_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_memberships_user ON store_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_store_memberships_store ON store_memberships(store_id);

-- Add optional store_id to existing tables for store-level data filtering
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
ALTER TABLE market_vehicles ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);

-- RLS policies for stores
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_memberships ENABLE ROW LEVEL SECURITY;

-- Tenant members can view their stores
CREATE POLICY stores_tenant_select ON stores
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Admin+ can insert/update/delete stores
CREATE POLICY stores_tenant_manage ON stores
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Store membership: tenant members can view assignments
CREATE POLICY store_memberships_select ON store_memberships
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Admin+ can manage store membership assignments
CREATE POLICY store_memberships_manage ON store_memberships
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
