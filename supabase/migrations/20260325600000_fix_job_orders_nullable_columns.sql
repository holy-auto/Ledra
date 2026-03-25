-- =============================================================
-- job_orders: NOT NULL制約 + 不明な外部キー制約を動的に一括修正
-- DB上に手動追加されたカラム・制約も含めて全て対処
-- =============================================================

-- ① 必須4カラム以外の NOT NULL を全て除去
DO $$
DECLARE
  col record;
  required_cols text[] := ARRAY[
    'id', 'from_tenant_id', 'title', 'status',
    'public_id', 'payment_status',
    'payment_confirmed_by_client', 'payment_confirmed_by_vendor',
    'created_at', 'updated_at'
  ];
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_orders'
      AND is_nullable = 'NO'
      AND column_name != ALL(required_cols)
  LOOP
    RAISE NOTICE 'Dropping NOT NULL from job_orders.%', col.column_name;
    EXECUTE format('ALTER TABLE job_orders ALTER COLUMN %I DROP NOT NULL', col.column_name);
  END LOOP;
END $$;

-- ② 既知の外部キー以外を全て除去
-- 残すFK: from_tenant_id->tenants, to_tenant_id->tenants, vehicle_id->vehicles, cancelled_by->auth.users
DO $$
DECLARE
  fk record;
  -- 既知のFK制約名パターン（これらは残す）
  known_fks text[] := ARRAY[
    'job_orders_from_tenant_id_fkey',
    'job_orders_to_tenant_id_fkey',
    'job_orders_vehicle_id_fkey',
    'job_orders_cancelled_by_fkey'
  ];
BEGIN
  FOR fk IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'job_orders'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name != ALL(known_fks)
  LOOP
    RAISE NOTICE 'Dropping unknown FK constraint: %', fk.constraint_name;
    EXECUTE format('ALTER TABLE job_orders DROP CONSTRAINT %I', fk.constraint_name);
  END LOOP;
END $$;
