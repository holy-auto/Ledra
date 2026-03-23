-- 車両と顧客マスタを紐付けるための customer_id カラムを追加
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id
  ON vehicles(tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;
