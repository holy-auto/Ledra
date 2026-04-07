-- Add missing columns to vehicles table that may not have been applied
-- vin_code (from 20260321000002), size_class (from 20260322000007), customer_id (from 20260322000009)

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vin_code text,
  ADD COLUMN IF NOT EXISTS size_class text
    CHECK (size_class IS NULL OR size_class IN ('SS', 'S', 'M', 'L', 'LL', 'XL')),
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles (tenant_id, vin_code)
  WHERE vin_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;
