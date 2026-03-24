-- =============================================================
-- job_orders テーブル拡張
-- 受発注強化: 注文番号、車両紐付け、合意金額、支払確認フロー
-- =============================================================

-- 連番用シーケンス
CREATE SEQUENCE IF NOT EXISTS job_order_number_seq;

-- 新カラム追加
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS order_number        text,
  ADD COLUMN IF NOT EXISTS vehicle_id          uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_amount     numeric,
  ADD COLUMN IF NOT EXISTS payment_method      text,
  ADD COLUMN IF NOT EXISTS payment_status      text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_confirmed_by_client  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by_vendor  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason       text;

-- CHECK制約
ALTER TABLE job_orders
  ADD CONSTRAINT job_orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer','cash','card','stripe_connect','other'));

ALTER TABLE job_orders
  ADD CONSTRAINT job_orders_payment_status_check
    CHECK (payment_status IN ('unpaid','confirmed_by_vendor','confirmed_by_client','both_confirmed'));

-- ステータスの拡張（既存CHECKを差し替え）
ALTER TABLE job_orders DROP CONSTRAINT IF EXISTS job_orders_status_check;
-- 元の無名CHECK制約を探して削除
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'job_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pending%accepted%'
  LOOP
    EXECUTE format('ALTER TABLE job_orders DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE job_orders
  ADD CONSTRAINT job_orders_status_check
    CHECK (status IN (
      'pending',           -- 発注待ち
      'quoting',           -- 見積中
      'accepted',          -- 受注済み
      'in_progress',       -- 作業中
      'approval_pending',  -- 検収待ち
      'payment_pending',   -- 支払待ち
      'completed',         -- 完了
      'rejected',          -- 辞退
      'cancelled'          -- キャンセル
    ));

-- 既存レコードに order_number を付与
UPDATE job_orders
SET order_number = 'ORD-' || to_char(created_at, 'YYYYMM') || '-' || lpad(nextval('job_order_number_seq')::text, 4, '0')
WHERE order_number IS NULL;

-- order_number のデフォルト（トリガーで生成する方が安全）
CREATE OR REPLACE FUNCTION generate_job_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('job_order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_orders_order_number
  BEFORE INSERT ON job_orders
  FOR EACH ROW EXECUTE FUNCTION generate_job_order_number();

-- インデックス
CREATE INDEX IF NOT EXISTS idx_job_orders_vehicle ON job_orders(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_orders_order_number ON job_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_job_orders_payment_status ON job_orders(payment_status) WHERE payment_status <> 'unpaid';
