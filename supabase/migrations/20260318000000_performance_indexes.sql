-- Performance indexes for common list queries
-- These composite indexes cover the most frequent query patterns:
-- WHERE tenant_id = X [AND status = Y] ORDER BY created_at DESC

-- Certificates: list by tenant, filter by status
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_status_created
  ON certificates (tenant_id, status, created_at DESC);

-- Customers: list by tenant, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_customers_tenant_created
  ON customers (tenant_id, created_at DESC);

-- Invoices: list by tenant, filter by status (skip if invoices is a VIEW)
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices' AND table_type='BASE TABLE') THEN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status_created ON invoices (tenant_id, status, created_at DESC)';
END IF;
END $$;

-- Documents: list by tenant, filter by doc_type and status
CREATE INDEX IF NOT EXISTS idx_documents_tenant_type_status_created
  ON documents (tenant_id, doc_type, status, created_at DESC);

-- Reservations: list by tenant + scheduled date (dashboard today count)
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_date_status
  ON reservations (tenant_id, scheduled_date, status);

-- Tenant memberships: lookup by user_id (used by resolveCallerWithRole on every request)
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id
  ON tenant_memberships (user_id);

-- Customer portal: login codes lookup
CREATE INDEX IF NOT EXISTS idx_customer_login_codes_tenant_email
  ON customer_login_codes (tenant_id, email, expires_at DESC);

-- Market vehicle images: lookup by vehicle
CREATE INDEX IF NOT EXISTS idx_market_vehicle_images_vehicle
  ON market_vehicle_images (vehicle_id, sort_order);
