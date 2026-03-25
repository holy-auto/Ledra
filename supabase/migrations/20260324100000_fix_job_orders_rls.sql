-- =============================================================
-- Fix job_orders RLS: policy references non-existent columns
-- poster_dealer_id / assigned_dealer_id → from_tenant_id / to_tenant_id
-- Also renames columns if the old names still exist on the remote DB.
-- =============================================================

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_orders') THEN

  -- ─── Step 1: Rename legacy columns if they still exist ───
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_orders' AND column_name = 'poster_dealer_id'
  ) THEN
    EXECUTE 'ALTER TABLE job_orders RENAME COLUMN poster_dealer_id TO from_tenant_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_orders' AND column_name = 'assigned_dealer_id'
  ) THEN
    EXECUTE 'ALTER TABLE job_orders RENAME COLUMN assigned_dealer_id TO to_tenant_id';
  END IF;

  -- ─── Step 2: Drop old v1 policies (original migration) ───
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_insert" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_delete" ON job_orders';

  -- ─── Step 3: Drop broken v2 policies that reference poster_dealer_id / assigned_dealer_id ───
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_insert_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_delete_v2" ON job_orders';

  -- ─── Step 4: Drop v3 policies in case of re-run ───
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select_v3" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_insert_v3" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update_v3" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_delete_v3" ON job_orders';

  -- ─── Step 5: Recreate with correct column names (from_tenant_id / to_tenant_id) ───
  EXECUTE 'CREATE POLICY "job_orders_select_v3" ON job_orders FOR SELECT USING (
    from_tenant_id IN (SELECT my_tenant_ids())
    OR to_tenant_id IN (SELECT my_tenant_ids())
  )';

  EXECUTE 'CREATE POLICY "job_orders_insert_v3" ON job_orders FOR INSERT WITH CHECK (
    from_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff'')
  )';

  -- UPDATE: 発注側・受注側それぞれ staff 以上のみ
  EXECUTE 'CREATE POLICY "job_orders_update_v3" ON job_orders FOR UPDATE USING (
    (from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff''))
    OR
    (to_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(to_tenant_id) IN (''owner'',''admin'',''staff''))
  )';

  -- DELETE: 発注者の admin 以上のみ
  EXECUTE 'CREATE POLICY "job_orders_delete_v3" ON job_orders FOR DELETE USING (
    from_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'')
  )';

  -- ─── Step 6: Ensure indexes use correct column names ───
  -- Drop old indexes if they exist with old column names
  EXECUTE 'DROP INDEX IF EXISTS idx_job_orders_poster';
  EXECUTE 'DROP INDEX IF EXISTS idx_job_orders_assigned';
  -- Recreate with correct names (IF NOT EXISTS handles fresh installs)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_job_orders_from ON job_orders(from_tenant_id, status, created_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_job_orders_to ON job_orders(to_tenant_id, status, created_at DESC)';

END IF;
END $$;
