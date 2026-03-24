-- =============================================================
-- Fix job_orders RLS: policy references non-existent columns
-- poster_dealer_id / assigned_dealer_id → from_tenant_id / to_tenant_id
-- =============================================================

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_orders') THEN
  -- Drop broken v2 policies that reference poster_dealer_id / assigned_dealer_id
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_insert_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update_v2" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_delete_v2" ON job_orders';

  -- Recreate with correct column names (from_tenant_id / to_tenant_id)
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
END IF;
END $$;
