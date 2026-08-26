-- Keep vehicles.vin_code_normalized in sync with vin_code.
--
-- Bug: migration 20260424000004 added `vin_code_normalized` and backfilled it
-- ONCE, but nothing keeps it populated. No writer sets it — not the create
-- route, the CSV import, the 車検証 OCR path, the passport upsert, nor the
-- admin pages — so every VIN entered after that backfill stayed NULL and the
-- vehicle became invisible to `/v/[vin]`, the paid history report, and the
-- merchant revenue share (all of which key off vin_code_normalized).
--
-- Production at the time of writing: 6 vehicles had a vin_code, but only the
-- one created before the backfill (2026-04-07) had vin_code_normalized. The
-- five entered since (2026-05-08 .. 2026-08-21) were stranded.
--
-- Fixed in the DB rather than in each writer: there are 5+ write paths today
-- (plus mobile and the external v1 API), so one trigger is a smaller and more
-- durable guard than one call per caller.
--
-- The rule must stay identical to `normalizeVin()` in
-- src/lib/passport/normalizeVin.ts, which normalizes the *lookup* side in the
-- v1 API routes, the report checkout, and `/v/[vin]`. Note this adds the NFKC
-- step the 20260424 backfill lacked, so full-width VINs now normalize the same
-- way on both sides; the backfill below re-normalizes any row that differs.
--
-- Caveat, deliberate: editing a vehicle's vin_code now re-keys
-- vin_code_normalized, and nothing cascades that to the tables that use it as
-- a join key (`vehicle_report_orders`, `vehicle_passports`). Correcting a VIN
-- typo therefore detaches an already-purchased report and orphans an anchored
-- passport row, which `upsertVehiclePassport()` will recreate under the new
-- key. Leaving the column stale instead is worse — the vehicle would stay
-- findable under a VIN it no longer has — so this migration keeps the column
-- truthful and the cascade is tracked in OPEN_QUESTIONS.md (2026-08-23).
-- There is no live exposure today: production has zero report orders.

-- Single definition of the rule. IMMUTABLE so the trigger, the backfill and
-- the self-check below cannot drift apart.
CREATE OR REPLACE FUNCTION vin_normalize(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  -- NFKC (full-width → half-width) → uppercase → strip whitespace, hyphens and
  -- U+FEFF. U+FEFF is listed explicitly because PostgreSQL's `\s` does not
  -- match it while JavaScript's does, and the two sides must agree.
  SELECT nullif(upper(regexp_replace(normalize(coalesce(raw, ''), NFKC), E'[\\s\\-\\ufeff]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION set_vehicle_vin_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  new.vin_code_normalized := public.vin_normalize(new.vin_code);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_vin_normalized ON vehicles;

-- Fires on every UPDATE, not just `UPDATE OF vin_code`, so a row whose
-- normalized value is stale for any reason self-heals on its next write.
CREATE TRIGGER trg_vehicles_vin_normalized
  BEFORE INSERT OR UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_vehicle_vin_normalized();

-- Backfill the stranded rows. Idempotent: only touches rows whose stored value
-- disagrees with the derived one.
UPDATE vehicles
   SET vin_code_normalized = vin_normalize(vin_code)
 WHERE vin_code_normalized IS DISTINCT FROM vin_normalize(vin_code);

-- Self-check. Fails the migration loudly if either half of the fix is wrong.
DO $$
DECLARE
  got   text;
  drift bigint;
BEGIN
  -- 1. The trigger actually normalizes (exercised on a throwaway table so no
  --    real vehicle row is created just to test).
  CREATE TEMP TABLE _vin_trigger_check (vin_code text, vin_code_normalized text);
  CREATE TRIGGER t BEFORE INSERT ON _vin_trigger_check
    FOR EACH ROW EXECUTE FUNCTION set_vehicle_vin_normalized();
  INSERT INTO _vin_trigger_check (vin_code) VALUES ('JH4－DC5－3001');
  SELECT vin_code_normalized INTO got FROM _vin_trigger_check;
  IF got IS DISTINCT FROM 'JH4DC53001' THEN
    RAISE EXCEPTION 'vin normalize trigger produced % (expected JH4DC53001)', got;
  END IF;
  DROP TABLE _vin_trigger_check;

  -- 2. Every row's stored value now agrees with the rule. Stated as agreement
  --    rather than "vin_code is set but normalized is NULL", so a placeholder
  --    VIN that legitimately normalizes to NULL (e.g. '---', '　') does not
  --    abort the migration.
  SELECT count(*) INTO drift
    FROM vehicles
   WHERE vin_code_normalized IS DISTINCT FROM vin_normalize(vin_code);
  IF drift > 0 THEN
    RAISE EXCEPTION '% vehicle(s) have a vin_code_normalized that disagrees with vin_code', drift;
  END IF;
END;
$$;
