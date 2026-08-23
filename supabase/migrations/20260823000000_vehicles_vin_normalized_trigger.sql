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
-- The expression must stay identical to `normalizeVin()` in
-- src/lib/passport/normalizeVin.ts — NFKC, uppercase, strip whitespace and
-- hyphens — because that helper normalizes the *lookup* side. Note this also
-- adds the NFKC step the 20260424 backfill lacked, so full-width VINs now
-- match; the backfill below re-normalizes any row that differs.

CREATE OR REPLACE FUNCTION set_vehicle_vin_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  new.vin_code_normalized :=
    nullif(upper(regexp_replace(normalize(coalesce(new.vin_code, ''), NFKC), '[\s\-]', '', 'g')), '');
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
   SET vin_code_normalized =
         nullif(upper(regexp_replace(normalize(coalesce(vin_code, ''), NFKC), '[\s\-]', '', 'g')), '')
 WHERE vin_code_normalized IS DISTINCT FROM
         nullif(upper(regexp_replace(normalize(coalesce(vin_code, ''), NFKC), '[\s\-]', '', 'g')), '');

-- Self-check. Fails the migration loudly if either half of the fix is wrong.
DO $$
DECLARE
  got     text;
  stranded bigint;
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

  -- 2. No vehicle is left with a VIN the passport cannot find.
  SELECT count(*) INTO stranded
    FROM vehicles
   WHERE vin_code IS NOT NULL
     AND btrim(vin_code) <> ''
     AND vin_code_normalized IS NULL;
  IF stranded > 0 THEN
    RAISE EXCEPTION '% vehicle(s) still have a vin_code but no vin_code_normalized', stranded;
  END IF;
END;
$$;
