-- =============================================================
-- Vehicle Digital Passport — Schema (PR-1)
--
-- Introduces a VIN-keyed aggregation layer on top of the existing
-- tenant-scoped `vehicles` table. Each physical vehicle gets one
-- row in `vehicle_passports` keyed by normalized VIN; individual
-- `vehicles` rows (owned per-tenant) continue to exist unchanged.
--
-- Access model:
--   - Reads: service role only (the public `/v/[vin]` page fetches
--     server-side via createTenantScopedAdmin / admin client, so no
--     anon SELECT policy is required).
--   - Writes: service role only, invoked from the anchor success
--     handler in src/lib/anchoring/*.
--
-- See: docs/vehicle-passport-design.md §5
-- =============================================================

-- -------------------------------------------------------------
-- vehicle_passports : one row per physical vehicle (by VIN)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_passports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Normalized VIN is the natural key. Normalization rules
  -- (applied in TS & in the backfill below):
  --   1. Strip ASCII whitespace and hyphens
  --   2. Uppercase
  --   3. Full-width -> half-width is handled in TS layer before insert
  vin_code_normalized   text NOT NULL UNIQUE,

  -- Display hints (denormalized from the most recent vehicles row).
  -- Not authoritative; the page re-queries vehicles for accuracy.
  display_maker         text,
  display_model         text,
  display_year          int,

  -- Cached counters (recomputed on anchor hook, see PR-2).
  anchored_cert_count   int NOT NULL DEFAULT 0,
  tenant_count          int NOT NULL DEFAULT 0,

  -- Timestamps
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_activity_at      timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Lookup by most-recent-activity (for ops dashboards / backfill jobs).
CREATE INDEX IF NOT EXISTS idx_vehicle_passports_last_activity
  ON vehicle_passports (last_activity_at DESC);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION touch_vehicle_passports_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS trg_vehicle_passports_touch_updated_at ON vehicle_passports;
CREATE TRIGGER trg_vehicle_passports_touch_updated_at
  BEFORE UPDATE ON vehicle_passports
  FOR EACH ROW
  EXECUTE FUNCTION touch_vehicle_passports_updated_at();

-- RLS: service role only. The public `/v/[vin]` page will read via
-- admin client; no anon policy is needed.
ALTER TABLE vehicle_passports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_passports_service_role_all" ON vehicle_passports;
CREATE POLICY "vehicle_passports_service_role_all" ON vehicle_passports
  FOR ALL USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- vehicles : add normalized VIN column + opt-out flag
--
-- Zero-downtime pattern: add as nullable, backfill, NOT NULL
-- enforcement is deferred (VIN itself is nullable on vehicles,
-- so `vin_code_normalized` is also nullable and only populated
-- when `vin_code IS NOT NULL`).
-- -------------------------------------------------------------
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vin_code_normalized text,
  ADD COLUMN IF NOT EXISTS passport_opt_out    boolean NOT NULL DEFAULT false;

-- Backfill: strip whitespace + hyphens, uppercase.
-- Full-width variants are cleaned up in application code going forward
-- (see src/lib/passport/normalizeVin.ts in PR-2). Rows inserted before
-- PR-2 with full-width chars will be re-normalized by the PR-6 backfill.
UPDATE vehicles
   SET vin_code_normalized = UPPER(REGEXP_REPLACE(vin_code, '[\s\-]', '', 'g'))
 WHERE vin_code IS NOT NULL
   AND vin_code_normalized IS NULL;

-- Lookup by VIN across tenants (cross-tenant aggregation for /v/[vin]).
CREATE INDEX IF NOT EXISTS idx_vehicles_vin_normalized
  ON vehicles (vin_code_normalized)
  WHERE vin_code_normalized IS NOT NULL;

-- Per-tenant opt-out lookup: used when fetching certs for passport.
CREATE INDEX IF NOT EXISTS idx_vehicles_vin_normalized_opt_in
  ON vehicles (vin_code_normalized)
  WHERE vin_code_normalized IS NOT NULL
    AND passport_opt_out = false;
