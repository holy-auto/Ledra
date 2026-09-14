-- =============================================================
-- Vehicle report revenue sharing — settlement (実送金) + reversal
--
-- Follow-up to 20260730000000_vehicle_report_revenue_shares (accrual
-- ledger). This wires the *money-out* side, reusing the existing agent
-- commission / order payout rails:
--
--   1) stripe_connect_transfers.source_type gains 'vehicle_report' so the
--      connect-webhook can record report-share payouts alongside
--      commissions/POS/orders (its transfer.created handler upserts a row
--      keyed on metadata.source_type).
--   2) vehicle_report_orders.status gains 'refunded' so a refunded report
--      sale can roll its merchant shares back (charge.refunded handler).
--
-- Both are CHECK-constraint widenings on small, low-write tables. Per repo
-- convention (CHECK は NOT VALID + VALIDATE) we drop the old constraint and
-- add the widened one NOT VALID, then VALIDATE separately to avoid a long
-- ACCESS EXCLUSIVE validation scan.
-- =============================================================

-- -------------------------------------------------------------
-- 1) stripe_connect_transfers.source_type += 'vehicle_report'
-- -------------------------------------------------------------
ALTER TABLE stripe_connect_transfers
  DROP CONSTRAINT IF EXISTS stripe_connect_transfers_source_type_check;

ALTER TABLE stripe_connect_transfers
  ADD CONSTRAINT stripe_connect_transfers_source_type_check
    CHECK (source_type IN (
      'commission',
      'invoice_payment',
      'pos_payment',
      'shop_order',
      'vehicle_report',   -- ← 車両レポート収益の施工店還元
      'manual',
      'other'
    )) NOT VALID;

ALTER TABLE stripe_connect_transfers
  VALIDATE CONSTRAINT stripe_connect_transfers_source_type_check;

-- -------------------------------------------------------------
-- 2) vehicle_report_orders.status += 'refunded'
-- -------------------------------------------------------------
ALTER TABLE vehicle_report_orders
  DROP CONSTRAINT IF EXISTS vehicle_report_orders_status_check;

ALTER TABLE vehicle_report_orders
  ADD CONSTRAINT vehicle_report_orders_status_check
    CHECK (status IN ('pending', 'paid', 'expired', 'refunded')) NOT VALID;

ALTER TABLE vehicle_report_orders
  VALIDATE CONSTRAINT vehicle_report_orders_status_check;
