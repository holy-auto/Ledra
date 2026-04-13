-- =============================================================
-- Customer Inquiries
-- Allows customers (via customer portal) to submit service
-- inquiries to a shop tenant, and lets tenant members manage them.
-- All DDL/policy statements are idempotent (safe to re-run).
-- =============================================================

CREATE TABLE IF NOT EXISTS customer_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   text NOT NULL,
  customer_email  text NOT NULL,
  customer_phone  text,
  subject         text,
  message         text NOT NULL,
  status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'responded', 'closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_tenant
  ON customer_inquiries (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_customer
  ON customer_inquiries (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE customer_inquiries ENABLE ROW LEVEL SECURITY;

-- Tenant members can view inquiries directed at their tenant
DROP POLICY IF EXISTS "tenant_members_select" ON customer_inquiries;
CREATE POLICY "tenant_members_select" ON customer_inquiries
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- Anyone (unauthenticated customers) can submit an inquiry
DROP POLICY IF EXISTS "public_insert" ON customer_inquiries;
CREATE POLICY "public_insert" ON customer_inquiries
  FOR INSERT WITH CHECK (true);

-- Tenant members (staff+) can update inquiry status
DROP POLICY IF EXISTS "tenant_members_update" ON customer_inquiries;
CREATE POLICY "tenant_members_update" ON customer_inquiries
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- Only owners/admins can delete inquiries
DROP POLICY IF EXISTS "tenant_admins_delete" ON customer_inquiries;
CREATE POLICY "tenant_admins_delete" ON customer_inquiries
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );
