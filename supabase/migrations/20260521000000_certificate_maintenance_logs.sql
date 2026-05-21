-- =============================================================================
-- Certificate Maintenance Logs
-- Records maintenance events performed after a certificate is issued.
-- Each entry has a performed-at timestamp and free-text content describing
-- what was done. Multiple entries can accrue over the certificate lifetime.
-- =============================================================================

CREATE TABLE IF NOT EXISTS certificate_maintenance_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id  uuid NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  performed_at    timestamptz NOT NULL,
  content         text NOT NULL,
  performed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_maint_log_cert
  ON certificate_maintenance_logs(certificate_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cert_maint_log_tenant
  ON certificate_maintenance_logs(tenant_id);

ALTER TABLE certificate_maintenance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cert_maint_log_select_tenant" ON certificate_maintenance_logs;
CREATE POLICY "cert_maint_log_select_tenant" ON certificate_maintenance_logs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

DROP POLICY IF EXISTS "cert_maint_log_insert_tenant" ON certificate_maintenance_logs;
CREATE POLICY "cert_maint_log_insert_tenant" ON certificate_maintenance_logs
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

DROP POLICY IF EXISTS "cert_maint_log_update_tenant" ON certificate_maintenance_logs;
CREATE POLICY "cert_maint_log_update_tenant" ON certificate_maintenance_logs
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

DROP POLICY IF EXISTS "cert_maint_log_delete_tenant" ON certificate_maintenance_logs;
CREATE POLICY "cert_maint_log_delete_tenant" ON certificate_maintenance_logs
  FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()));
