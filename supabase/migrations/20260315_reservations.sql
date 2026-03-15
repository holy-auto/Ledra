-- =============================================================
-- Reservations (予約管理) Migration
-- 予約テーブル: 顧客・車両・メニュー紐付き、作業ステータス統合
-- =============================================================

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  vehicle_id uuid REFERENCES vehicles(id),

  -- 予約内容
  title text NOT NULL,                        -- 予約タイトル（例: ガラスコーティング）
  menu_items_json jsonb DEFAULT '[]',         -- [{menu_item_id, name, price}]
  note text,                                  -- 備考

  -- 日時
  scheduled_date date NOT NULL,               -- 予約日
  start_time time,                            -- 開始時刻
  end_time time,                              -- 終了時刻（見積り）

  -- 担当者
  assigned_user_id uuid REFERENCES auth.users(id),

  -- ステータス（作業フロー統合）
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN (
      'confirmed',     -- 予約確定
      'arrived',       -- 来店・受付
      'in_progress',   -- 作業中
      'completed',     -- 完了・納車
      'cancelled'      -- キャンセル
    )),

  -- 金額
  estimated_amount integer DEFAULT 0,

  -- キャンセル情報
  cancelled_at timestamptz,
  cancel_reason text,

  -- タイムスタンプ
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(tenant_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_vehicle ON reservations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(tenant_id, status);

-- RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservations_tenant_select ON reservations;
CREATE POLICY reservations_tenant_select ON reservations
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS reservations_tenant_insert ON reservations;
CREATE POLICY reservations_tenant_insert ON reservations
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS reservations_tenant_update ON reservations;
CREATE POLICY reservations_tenant_update ON reservations
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS reservations_tenant_delete ON reservations;
CREATE POLICY reservations_tenant_delete ON reservations
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- updated_at トリガー
CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
