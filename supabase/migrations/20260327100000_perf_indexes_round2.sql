-- Performance indexes for frequently queried columns
-- These indexes cover common filter patterns found in API routes

-- agent_referrals: agent dashboard uses agent_id + status filtering
CREATE INDEX IF NOT EXISTS idx_agent_referrals_agent_status
  ON agent_referrals(agent_id, status);

-- agent_commissions: agent dashboard queries by agent_id + period
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_period
  ON agent_commissions(agent_id, period_start DESC);

-- insurer_tenant_access: filtered by insurer_id + active status
CREATE INDEX IF NOT EXISTS idx_insurer_tenant_access_active
  ON insurer_tenant_access(insurer_id) WHERE is_active = true;

-- job_orders: dashboard and browse queries filter by tenant + status
CREATE INDEX IF NOT EXISTS idx_job_orders_from_tenant_status
  ON job_orders(from_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_job_orders_to_tenant_status
  ON job_orders(to_tenant_id, status);

-- market_vehicles: browse/list queries filter by tenant + status + date
CREATE INDEX IF NOT EXISTS idx_market_vehicles_tenant_status
  ON market_vehicles(tenant_id, status, created_at DESC);

-- market_vehicle_images: looked up by vehicle_id
CREATE INDEX IF NOT EXISTS idx_market_vehicle_images_vehicle
  ON market_vehicle_images(vehicle_id);

-- square_orders: sync checks existing by tenant + square_order_id
CREATE INDEX IF NOT EXISTS idx_square_orders_tenant_sq_id
  ON square_orders(tenant_id, square_order_id);

-- notification_logs: cron jobs check by target_type + target_id + type
CREATE INDEX IF NOT EXISTS idx_notification_logs_target
  ON notification_logs(target_type, target_id, type);

-- documents: billing cron filters by doc_type + status + due_date
CREATE INDEX IF NOT EXISTS idx_documents_billing_overdue
  ON documents(doc_type, status, due_date)
  WHERE due_date IS NOT NULL;
