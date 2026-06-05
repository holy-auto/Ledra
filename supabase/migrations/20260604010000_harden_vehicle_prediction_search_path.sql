-- Harden fn_sync_mileage_from_certificate() (introduced in
-- 20260604000000_vehicle_prediction_data_infra.sql, PR #511) against
-- search_path hijacking.
--
-- The original definition is SECURITY DEFINER with no `SET search_path` and an
-- unqualified `vehicle_mileage_logs` reference. This migration sorts AFTER that
-- one (…010000 > …000000), so this CREATE OR REPLACE is the effective final
-- definition. The trigger trg_sync_mileage_from_certificate references the
-- function by name and is unaffected.
--
-- Found by the security-definer-mutable-search-path migration lint rule added in
-- this branch. See docs/AUDIT_REPORT_20260604.md (MEDIUM-4).

CREATE OR REPLACE FUNCTION fn_sync_mileage_from_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mileage integer;
  v_vehicle_id uuid;
  v_tenant_id uuid;
BEGIN
  -- maintenance_json に mileage が含まれる場合のみ処理
  v_mileage := (new.maintenance_json->>'mileage')::integer;
  IF v_mileage IS NULL OR v_mileage <= 0 THEN
    RETURN new;
  END IF;

  v_vehicle_id := new.vehicle_id;
  v_tenant_id  := new.tenant_id;
  IF v_vehicle_id IS NULL THEN
    RETURN new;
  END IF;

  INSERT INTO public.vehicle_mileage_logs
    (tenant_id, vehicle_id, certificate_id, mileage_km, recorded_at, source)
  VALUES
    (v_tenant_id, v_vehicle_id, new.id, v_mileage, coalesce(new.created_at, now()), 'maintenance')
  ON CONFLICT DO NOTHING;

  RETURN new;
EXCEPTION
  WHEN others THEN
    -- トリガーの失敗で本体の保存をブロックしない
    RETURN new;
END;
$$;
