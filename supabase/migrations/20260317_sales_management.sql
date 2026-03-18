-- ============================================================
-- 中古車販売管理強化マイグレーション
-- 仕入原価・仕入先・仕入日・在庫日数・顧客興味追跡
-- ============================================================

-- 仕入・コスト管理カラム追加
ALTER TABLE market_vehicles
  ADD COLUMN IF NOT EXISTS cost_price integer,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_price integer,
  ADD COLUMN IF NOT EXISTS buyer_info jsonb;

-- 在庫日数インデックス
CREATE INDEX IF NOT EXISTS idx_market_vehicles_acquisition
  ON market_vehicles(acquisition_date)
  WHERE acquisition_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_vehicles_sold
  ON market_vehicles(sold_at DESC)
  WHERE status = 'sold';

-- 顧客興味追跡テーブル（CRM連携）
CREATE TABLE IF NOT EXISTS vehicle_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES market_vehicles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 顧客情報
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,

  -- 追跡
  interest_level text NOT NULL DEFAULT 'warm'
    CHECK (interest_level IN ('hot', 'warm', 'cold')),
  note text,
  follow_up_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'converted', 'lost')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vehicle_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_vehicle_interests_select" ON vehicle_interests
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_vehicle_interests_insert" ON vehicle_interests
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_vehicle_interests_update" ON vehicle_interests
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_vehicle_interests_delete" ON vehicle_interests
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_vehicle_interests_vehicle ON vehicle_interests(vehicle_id);
CREATE INDEX idx_vehicle_interests_tenant ON vehicle_interests(tenant_id);
CREATE INDEX idx_vehicle_interests_follow_up ON vehicle_interests(follow_up_date)
  WHERE status = 'active';
