-- =============================================================
-- Vehicle Passport — Ownership Transfer
--
-- Adds a tenant-mediated ownership transfer flow on top of the
-- VIN-keyed `vehicle_passports` aggregation. Use case: a coating /
-- PPF shop's customer sells their car → the shop initiates a
-- transfer → the new owner accepts via a tokenized email link →
-- the passport's `current_owner_email` flips to the new owner,
-- and the prior owner's PII is masked from any future
-- owner-facing views.
--
-- Threat model:
--   - Tokens are opaque random strings; only the SHA-256 hash is
--     stored. Token leak in DB ≠ token compromise.
--   - Transfers expire after 14 days (configurable per-row).
--   - Only the initiating tenant can cancel a pending transfer.
--   - Once accepted, the action is permanent (a new transfer
--     can reverse it, but the audit trail remains).
--
-- See: docs/vehicle-passport-design.md §6 (Ownership transfer)
-- =============================================================

-- -------------------------------------------------------------
-- vehicle_passports : current owner snapshot + PII mask flag
-- -------------------------------------------------------------
ALTER TABLE vehicle_passports
  ADD COLUMN IF NOT EXISTS current_owner_email text,
  ADD COLUMN IF NOT EXISTS current_owner_name  text,
  ADD COLUMN IF NOT EXISTS ownership_set_at    timestamptz,
  ADD COLUMN IF NOT EXISTS pii_masked_at       timestamptz;

COMMENT ON COLUMN vehicle_passports.current_owner_email IS
  'Lowercased current-owner email. Set on accepted ownership transfers; nullable for passports that have never had an ownership transfer recorded.';
COMMENT ON COLUMN vehicle_passports.pii_masked_at IS
  'Timestamp at which the most recent ownership transfer was accepted. While set, owner-facing views must mask prior-owner contact info from the new owner.';

-- NOTE: the lookup index on current_owner_email lives in a
-- standalone migration (20260522000002) so it can be created
-- CONCURRENTLY without holding an ACCESS EXCLUSIVE lock on the
-- live vehicle_passports table.

-- -------------------------------------------------------------
-- passport_ownership_transfers : transfer protocol state machine
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passport_ownership_transfers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- VIN is the natural key for "the same physical vehicle". The
  -- per-tenant vehicle row that initiated the request is recorded
  -- separately for audit / RLS scoping.
  vin_code_normalized      text NOT NULL,
  initiating_tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  initiating_vehicle_id    uuid REFERENCES vehicles (id) ON DELETE SET NULL,
  initiated_by_user_id     uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  -- Snapshot of the prior owner at the moment of initiation.
  -- Used so that an accepted transfer can mask their PII without
  -- losing the audit trail of "who was the owner before".
  from_owner_email         text,
  from_owner_name          text,

  -- The recipient. `to_owner_name` is optional — the new owner
  -- can supply it when accepting.
  to_owner_email           text NOT NULL,
  to_owner_name            text,

  -- SHA-256(token + CUSTOMER_AUTH_PEPPER). The raw token only
  -- exists in the email body and the recipient's clipboard.
  transfer_token_hash      text NOT NULL UNIQUE,

  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),

  -- Optional message from initiator → new owner, shown on the
  -- accept page. Plain text (rendered escaped client-side).
  message                  text,

  initiated_at             timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  responded_at             timestamptz,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE passport_ownership_transfers IS
  'Pending + historical ownership transfers for vehicle passports. One pending row per VIN at a time is enforced by the partial unique index below.';

-- Only one *pending* transfer per VIN. Multiple completed
-- transfers (history) are fine; they just won't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_passport_transfers_pending_per_vin
  ON passport_ownership_transfers (vin_code_normalized)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_passport_transfers_vin
  ON passport_ownership_transfers (vin_code_normalized);

CREATE INDEX IF NOT EXISTS idx_passport_transfers_tenant
  ON passport_ownership_transfers (initiating_tenant_id, initiated_at DESC);

-- Cron expiry sweep: range scan on expires_at filtered to pending.
CREATE INDEX IF NOT EXISTS idx_passport_transfers_pending_expiry
  ON passport_ownership_transfers (expires_at)
  WHERE status = 'pending';

-- updated_at auto-touch (reuses the function defined in 20260424000000)
DROP TRIGGER IF EXISTS trg_passport_transfers_touch_updated_at ON passport_ownership_transfers;
CREATE TRIGGER trg_passport_transfers_touch_updated_at
  BEFORE UPDATE ON passport_ownership_transfers
  FOR EACH ROW
  EXECUTE FUNCTION touch_vehicle_passports_updated_at();

-- -------------------------------------------------------------
-- RLS
--
-- Reads:
--   - initiating tenant members can see their own initiated transfers
--   - service role can see everything (cron, accept-by-token handler)
-- Writes:
--   - service role only (all state transitions go through server-side
--     handlers in src/lib/passport/transfers/*)
-- -------------------------------------------------------------
ALTER TABLE passport_ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passport_transfers_tenant_select" ON passport_ownership_transfers;
CREATE POLICY "passport_transfers_tenant_select"
  ON passport_ownership_transfers
  FOR SELECT
  USING (initiating_tenant_id IN (SELECT my_tenant_ids()));

DROP POLICY IF EXISTS "passport_transfers_service_role_all" ON passport_ownership_transfers;
CREATE POLICY "passport_transfers_service_role_all"
  ON passport_ownership_transfers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
