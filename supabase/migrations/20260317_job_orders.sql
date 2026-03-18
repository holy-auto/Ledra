-- =============================================================
-- Job Orders (BtoB 発注管理) Migration
-- テナント間の施工発注・受注を管理するテーブル
-- =============================================================

CREATE TABLE IF NOT EXISTS job_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 発注内容
  title text NOT NULL,
  description text,
  category text,
  budget numeric,
  deadline date,

  -- ステータス
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',       -- 発注待ち
      'accepted',      -- 受注済み
      'in_progress',   -- 作業中
      'completed',     -- 完了
      'rejected',      -- 却下
      'cancelled'      -- キャンセル
    )),

  -- タイムスタンプ
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_job_orders_from ON job_orders(from_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_orders_to ON job_orders(to_tenant_id, status, created_at DESC);

-- RLS
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- 自テナントが送信者または受信者の場合に閲覧可能
CREATE POLICY job_orders_select ON job_orders
  FOR SELECT USING (
    from_tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
    OR
    to_tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- 自テナントからのみ発注可能
CREATE POLICY job_orders_insert ON job_orders
  FOR INSERT WITH CHECK (
    from_tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- 関係テナントのみ更新可能
CREATE POLICY job_orders_update ON job_orders
  FOR UPDATE USING (
    from_tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
    OR
    to_tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- updated_at トリガー
CREATE TRIGGER trg_job_orders_updated_at
  BEFORE UPDATE ON job_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
