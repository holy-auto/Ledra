-- certificates テーブルに新カラム追加
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS maintenance_date date,
  ADD COLUMN IF NOT EXISTS warranty_exclusions text,
  ADD COLUMN IF NOT EXISTS remarks text;

-- invoices テーブルに車両情報追加
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_info_json jsonb DEFAULT '{}'::jsonb;

-- documents テーブルにも車両情報追加
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_info_json jsonb DEFAULT '{}'::jsonb;
