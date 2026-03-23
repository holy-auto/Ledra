-- ============================================================
-- Square POS Integration Tables
-- READ-ONLY import of Square orders/sales into CARTRUST
-- ============================================================

-- -----------------------------------------------------------
-- 0) Add square_merchant_id to tenants
-- -----------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS square_merchant_id text;

-- ============================================================
-- 1) square_connections – OAuth connection per tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS square_connections (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT UNIQUE,
  square_merchant_id      text        NOT NULL,
  square_access_token     text        NOT NULL,
  square_refresh_token    text        NOT NULL,
  square_token_expires_at timestamptz NOT NULL,
  square_location_ids     text[]      DEFAULT '{}',
  status                  text        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'pending', 'disconnected', 'error')),
  connected_at            timestamptz DEFAULT now(),
  connected_by            uuid        REFERENCES auth.users(id),
  last_synced_at          timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_square_connections_tenant    ON square_connections(tenant_id);
CREATE INDEX idx_square_connections_status    ON square_connections(status);
CREATE INDEX idx_square_connections_merchant  ON square_connections(square_merchant_id);

-- ============================================================
-- 2) square_orders – Imported Square orders/sales
-- ============================================================
CREATE TABLE IF NOT EXISTS square_orders (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  square_order_id     text        NOT NULL,
  square_location_id  text        NOT NULL,
  order_state         text,
  total_amount        integer     NOT NULL,
  tax_amount          integer     DEFAULT 0,
  discount_amount     integer     DEFAULT 0,
  tip_amount          integer     DEFAULT 0,
  net_amount          integer     NOT NULL,
  currency            text        DEFAULT 'JPY',
  payment_methods     text[]      DEFAULT '{}',
  items_json          jsonb       DEFAULT '[]',
  tenders_json        jsonb       DEFAULT '[]',
  square_customer_id  text,
  square_receipt_url  text,
  square_created_at   timestamptz NOT NULL,
  square_closed_at    timestamptz,
  raw_json            jsonb,
  customer_id         uuid        REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id          uuid        REFERENCES vehicles(id) ON DELETE SET NULL,
  certificate_id      uuid        REFERENCES certificates(id) ON DELETE SET NULL,
  note                text,
  synced_at           timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT uq_square_orders_tenant_order UNIQUE (tenant_id, square_order_id)
);

CREATE INDEX idx_square_orders_tenant       ON square_orders(tenant_id);
CREATE INDEX idx_square_orders_order_id     ON square_orders(square_order_id);
CREATE INDEX idx_square_orders_created_at   ON square_orders(square_created_at);
CREATE INDEX idx_square_orders_customer     ON square_orders(customer_id);
CREATE INDEX idx_square_orders_synced_at    ON square_orders(synced_at);

-- ============================================================
-- 3) square_sync_runs – Audit log for sync operations
-- ============================================================
CREATE TABLE IF NOT EXISTS square_sync_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  started_at      timestamptz DEFAULT now(),
  finished_at     timestamptz,
  status          text        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  trigger_type    text        NOT NULL
                              CHECK (trigger_type IN ('manual', 'scheduled', 'webhook')),
  triggered_by    uuid        REFERENCES auth.users(id),
  orders_fetched  integer     DEFAULT 0,
  orders_imported integer     DEFAULT 0,
  orders_skipped  integer     DEFAULT 0,
  errors_json     jsonb       DEFAULT '[]',
  sync_from       timestamptz,
  sync_to         timestamptz,
  cursor_state    text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_square_sync_runs_tenant    ON square_sync_runs(tenant_id);
CREATE INDEX idx_square_sync_runs_status    ON square_sync_runs(tenant_id, status);
CREATE INDEX idx_square_sync_runs_started   ON square_sync_runs(started_at);

-- ============================================================
-- 4) RLS – Enable on all tables
-- ============================================================
ALTER TABLE square_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE square_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE square_sync_runs   ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------
-- square_connections: SELECT/UPDATE = all members, INSERT/DELETE = admin+
-- -----------------------------------------------------------
CREATE POLICY square_connections_select_v2 ON square_connections
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY square_connections_insert_v2 ON square_connections
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY square_connections_update_v2 ON square_connections
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY square_connections_delete_v2 ON square_connections
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- -----------------------------------------------------------
-- square_orders: SELECT = all members, INSERT/UPDATE/DELETE = admin+
-- -----------------------------------------------------------
CREATE POLICY square_orders_select_v2 ON square_orders
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY square_orders_insert_v2 ON square_orders
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY square_orders_update_v2 ON square_orders
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY square_orders_delete_v2 ON square_orders
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- -----------------------------------------------------------
-- square_sync_runs: SELECT = all members, INSERT/UPDATE = admin+
-- -----------------------------------------------------------
CREATE POLICY square_sync_runs_select_v2 ON square_sync_runs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY square_sync_runs_insert_v2 ON square_sync_runs
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY square_sync_runs_update_v2 ON square_sync_runs
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- ============================================================
-- 5) updated_at triggers
-- ============================================================
CREATE TRIGGER trg_square_connections_updated_at
  BEFORE UPDATE ON square_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_square_orders_updated_at
  BEFORE UPDATE ON square_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
