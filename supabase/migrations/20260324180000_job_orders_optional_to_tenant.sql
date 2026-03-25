-- =============================================================
-- job_orders: to_tenant_id を任意に（発注先未定での発注を可能に）
-- =============================================================

-- NOT NULL 制約を解除
ALTER TABLE job_orders ALTER COLUMN to_tenant_id DROP NOT NULL;

-- RLS ポリシー更新: to_tenant_id IS NULL の注文は発注者のみ閲覧可
-- (発注先が決まったら通常のルールに戻る)
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_orders') THEN
  -- v3 を削除して v4 に差し替え
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select_v3" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select_v4" ON job_orders';
  EXECUTE 'CREATE POLICY "job_orders_select_v4" ON job_orders FOR SELECT USING (
    from_tenant_id IN (SELECT my_tenant_ids())
    OR (to_tenant_id IS NOT NULL AND to_tenant_id IN (SELECT my_tenant_ids()))
  )';

  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update_v3" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update_v4" ON job_orders';
  EXECUTE 'CREATE POLICY "job_orders_update_v4" ON job_orders FOR UPDATE USING (
    (from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff''))
    OR
    (to_tenant_id IS NOT NULL AND to_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(to_tenant_id) IN (''owner'',''admin'',''staff''))
  )';
END IF;
END $$;
