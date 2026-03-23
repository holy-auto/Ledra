-- Remove customer contact fields from vehicles and add VIN/chassis number
-- customer data belongs in the customers table, not vehicles

ALTER TABLE vehicles
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS customer_email,
  DROP COLUMN IF EXISTS customer_phone_masked,
  ADD COLUMN IF NOT EXISTS vin_code text;

COMMENT ON COLUMN vehicles.vin_code IS '車体番号（VINコード）— 車検証に記載の17桁英数字';

CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles (tenant_id, vin_code)
  WHERE vin_code IS NOT NULL;
