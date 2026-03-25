-- =============================================================
-- job_orders: 全カラムが存在することを保証
-- CREATE TABLE IF NOT EXISTS ではテーブルが既存の場合カラムが追加されない。
-- この修正マイグレーションで全カラムをべき等に追加する。
-- =============================================================

-- 初期テーブル作成（テーブル自体が無い場合のみ）
CREATE TABLE IF NOT EXISTS job_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- ─── 初期マイグレーション (20260317000004) のカラム ───
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS category       text,
  ADD COLUMN IF NOT EXISTS budget         numeric,
  ADD COLUMN IF NOT EXISTS deadline       date;

-- ─── 拡張マイグレーション (20260324110000) のカラム ───
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS order_number                  text,
  ADD COLUMN IF NOT EXISTS vehicle_id                    uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_amount               numeric,
  ADD COLUMN IF NOT EXISTS payment_method                text,
  ADD COLUMN IF NOT EXISTS payment_status                text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_confirmed_by_client   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by_vendor   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_completed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS client_approved_at            timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason                 text;

-- ─── インデックス ───
CREATE INDEX IF NOT EXISTS idx_job_orders_from ON job_orders(from_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_orders_to ON job_orders(to_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_orders_vehicle ON job_orders(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_orders_order_number ON job_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_job_orders_payment_status ON job_orders(payment_status) WHERE payment_status <> 'unpaid';
CREATE INDEX IF NOT EXISTS idx_job_orders_combined ON job_orders(status, created_at DESC);

-- PostgREST のスキーマキャッシュをリロード
NOTIFY pgrst, 'reload schema';
