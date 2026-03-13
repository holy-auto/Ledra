-- ============================================================
-- BtoB中古車在庫共有 マイグレーション
-- market_vehicles + market_vehicle_images
-- ============================================================

-- BtoB在庫用車両テーブル（施工証明書の vehicles とは別）
CREATE TABLE IF NOT EXISTS market_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 基本情報
  maker text NOT NULL,
  model text NOT NULL,
  grade text,
  year integer,
  mileage integer,
  color text,
  color_code text,

  -- 車両識別
  plate_number text,
  chassis_number text,

  -- スペック
  engine_type text,
  displacement integer,
  transmission text,
  drive_type text,
  fuel_type text,
  door_count integer,
  seating_capacity integer,
  body_type text,

  -- コンディション
  inspection_date date,
  repair_history text,
  condition_grade text,
  condition_note text,

  -- 価格
  asking_price integer,
  wholesale_price integer,

  -- ステータス
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','listed','reserved','sold','withdrawn')),
  listed_at timestamptz,

  -- メタ
  description text,
  features text[],

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE market_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_market_vehicles_select" ON market_vehicles
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR status = 'listed'
  );

CREATE POLICY "tenant_market_vehicles_insert" ON market_vehicles
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_market_vehicles_update" ON market_vehicles
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_market_vehicles_delete" ON market_vehicles
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_market_vehicles_tenant ON market_vehicles(tenant_id);
CREATE INDEX idx_market_vehicles_status ON market_vehicles(status);
CREATE INDEX idx_market_vehicles_maker ON market_vehicles(maker);
CREATE INDEX idx_market_vehicles_body_type ON market_vehicles(body_type);
CREATE INDEX idx_market_vehicles_listed ON market_vehicles(listed_at DESC) WHERE status = 'listed';

-- 車両画像 (MAX 20枚)
CREATE TABLE IF NOT EXISTS market_vehicle_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES market_vehicles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  content_type text,
  file_size integer,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE market_vehicle_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_market_vehicle_images_select" ON market_vehicle_images
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR vehicle_id IN (
      SELECT id FROM market_vehicles WHERE status = 'listed'
    )
  );

CREATE POLICY "tenant_market_vehicle_images_insert" ON market_vehicle_images
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_market_vehicle_images_delete" ON market_vehicle_images
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_market_vehicle_images_vehicle ON market_vehicle_images(vehicle_id, sort_order);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('market', 'market', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "market_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'market');

CREATE POLICY "market_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'market' AND auth.uid() IS NOT NULL);

CREATE POLICY "market_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'market' AND auth.uid() IS NOT NULL);
