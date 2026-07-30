-- =============================================================
-- Vehicle report revenue sharing — accrual ledger
--
-- The paid vehicle history report (`vehicle_report_orders`) sells a
-- cross-tenant view of one VIN's施工 history. Until now 100% of that
-- sale went to the platform. This migration wires up the entitlement
-- side of "技術が、資産になる。": each sale is split so that the
-- 施工店 (tenants) that left anchored records on that VIN earn a share,
-- proportional to how many records each contributed.
--
-- Design: docs/merchant-revenue-sharing-design.md
--
--   - `vehicle_report_settings.merchant_share_bps`: the total % of a
--     sale returned to merchants (basis points; 7000 = 70%). Platform
--     keeps the remainder. Configurable alongside the report price.
--   - `vehicle_report_revenue_shares`: one row per (sale × tenant),
--     an accrual ledger mirroring `agent_commissions`. Money is NOT
--     transferred here — the row is booked `pending`; actual payout
--     reuses the existing Stripe Connect transfer path later.
--
-- Writes: service-role only (booked from the paid-order handlers).
-- Reads : merchant portal server layer, tenant-scoped.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Merchant share rate on the platform-wide settings singleton.
--    bps (0..10000) so the split stays integer-exact. 7000 = 70%.
-- -------------------------------------------------------------
ALTER TABLE vehicle_report_settings
  ADD COLUMN IF NOT EXISTS merchant_share_bps integer NOT NULL DEFAULT 7000
    CHECK (merchant_share_bps >= 0 AND merchant_share_bps <= 10000);

-- -------------------------------------------------------------
-- 2) Accrual ledger: one row per (report sale × contributing tenant).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_report_revenue_shares (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The report sale that produced this entitlement.
  order_id              uuid NOT NULL
                          REFERENCES vehicle_report_orders (id) ON DELETE CASCADE,

  -- The施工店 receiving the share.
  tenant_id             uuid NOT NULL
                          REFERENCES tenants (id) ON DELETE CASCADE,

  -- Audit / reporting context.
  vin_code_normalized   text NOT NULL,

  -- Proration weights (snapshot at booking time).
  cert_count            integer NOT NULL,   -- this tenant's anchored records on the VIN
  total_cert_count      integer NOT NULL,   -- all tenants' anchored records on the VIN
  sale_amount_jpy       integer NOT NULL,   -- original report price
  share_bps             integer NOT NULL,   -- merchant_share_bps snapshot

  -- The prorated amount credited to this tenant (JPY, zero-decimal).
  amount                integer NOT NULL,
  currency              text NOT NULL DEFAULT 'jpy',

  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending',   -- 計上済み・未払い
                            'approved',  -- 承認済み
                            'paid',      -- 送金済み
                            'failed',    -- 送金失敗
                            'cancelled', -- 取消
                            'reversed'   -- 返金巻き戻し
                          )),

  stripe_transfer_id    text,
  paid_at               timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: the two paid-order paths (webhook + unlock) must
  -- never double-book. One share per (sale, tenant).
  CONSTRAINT vehicle_report_revenue_shares_order_tenant_uniq
    UNIQUE (order_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_vrrs_tenant
  ON vehicle_report_revenue_shares (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vrrs_order
  ON vehicle_report_revenue_shares (order_id);
CREATE INDEX IF NOT EXISTS idx_vrrs_status
  ON vehicle_report_revenue_shares (status);
CREATE INDEX IF NOT EXISTS idx_vrrs_tenant_created
  ON vehicle_report_revenue_shares (tenant_id, created_at DESC);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION touch_vehicle_report_revenue_shares_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS trg_vrrs_touch_updated_at ON vehicle_report_revenue_shares;
CREATE TRIGGER trg_vrrs_touch_updated_at
  BEFORE UPDATE ON vehicle_report_revenue_shares
  FOR EACH ROW
  EXECUTE FUNCTION touch_vehicle_report_revenue_shares_updated_at();

ALTER TABLE vehicle_report_revenue_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vrrs_service_role_all" ON vehicle_report_revenue_shares;
CREATE POLICY "vrrs_service_role_all" ON vehicle_report_revenue_shares
  FOR ALL USING (auth.role() = 'service_role');
