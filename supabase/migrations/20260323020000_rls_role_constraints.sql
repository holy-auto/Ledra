-- =============================================================
-- RLS Role Constraints Migration
-- Adds role-based access control to RLS policies.
-- All table references use IF EXISTS guards for safety.
-- Rules:
--   SELECT : all roles (owner, admin, staff, viewer)
--   INSERT : owner, admin, staff
--   UPDATE : owner, admin, staff
--   DELETE : owner, admin only
-- Special:
--   tenant_memberships UPDATE/DELETE : owner only
--   tenants UPDATE : owner only
--   insurer_access_logs INSERT : insurer_users only
-- =============================================================

-- -------------------------------------------------------
-- 0) Helper function: get caller's role within a tenant
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION my_tenant_role(p_tenant_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.tenant_memberships
  WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  LIMIT 1;
$$;

-- -------------------------------------------------------
-- Helper: apply standard RLS policies (SELECT=all, INSERT/UPDATE=staff+, DELETE=admin+)
-- Uses dynamic SQL so missing tables don't cause errors.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION _apply_standard_rls(
  p_table text,
  p_old_policies text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pol text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = p_table) THEN
    RAISE NOTICE 'Table % does not exist, skipping RLS', p_table;
    RETURN;
  END IF;

  -- Drop old policies
  FOREACH pol IN ARRAY p_old_policies LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, p_table);
  END LOOP;

  -- SELECT: all tenant members
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()))',
    p_table || '_select_v2', p_table
  );
  -- INSERT: owner, admin, staff
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))',
    p_table || '_insert_v2', p_table
  );
  -- UPDATE: owner, admin, staff
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))',
    p_table || '_update_v2', p_table
  );
  -- DELETE: owner, admin only
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))',
    p_table || '_delete_v2', p_table
  );
END;
$$;

-- =============================================================
-- 1-10) Core tables with standard tenant_id RLS
-- =============================================================
SELECT _apply_standard_rls('vehicles', ARRAY['vehicles_select','vehicles_insert','vehicles_update','vehicles_delete']);
SELECT _apply_standard_rls('certificates', ARRAY['certs_select','certs_insert','certs_update']);
SELECT _apply_standard_rls('templates', ARRAY['tpl_select','tpl_insert','tpl_update','tpl_delete']);
SELECT _apply_standard_rls('nfc_tags', ARRAY['nfc_select','nfc_insert','nfc_update']);
SELECT _apply_standard_rls('documents', ARRAY['documents_tenant_select','documents_tenant_insert','documents_tenant_update','documents_tenant_delete']);
SELECT _apply_standard_rls('menu_items', ARRAY['menu_items_tenant_select','menu_items_tenant_insert','menu_items_tenant_update','menu_items_tenant_delete']);
SELECT _apply_standard_rls('customers', ARRAY['customers_tenant_select','customers_tenant_insert','customers_tenant_update','customers_tenant_delete']);
SELECT _apply_standard_rls('reservations', ARRAY['reservations_tenant_select','reservations_tenant_insert','reservations_tenant_update','reservations_tenant_delete']);
SELECT _apply_standard_rls('vehicle_histories', ARRAY['vh_select','vh_insert']);

-- invoices — SKIPPED: now a VIEW on documents (see 20260323010000)

-- =============================================================
-- 3) certificate_images (inherits from parent certificate)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'certificate_images') THEN
  EXECUTE 'DROP POLICY IF EXISTS "certimg_select" ON certificate_images';
  EXECUTE 'DROP POLICY IF EXISTS "certimg_insert" ON certificate_images';

  EXECUTE 'CREATE POLICY "certificate_images_select_v2" ON certificate_images FOR SELECT USING (certificate_id IN (SELECT id FROM certificates WHERE tenant_id IN (SELECT my_tenant_ids())))';
  EXECUTE 'CREATE POLICY "certificate_images_insert_v2" ON certificate_images FOR INSERT WITH CHECK (certificate_id IN (SELECT id FROM certificates WHERE tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff'')))';
  EXECUTE 'CREATE POLICY "certificate_images_update_v2" ON certificate_images FOR UPDATE USING (certificate_id IN (SELECT id FROM certificates WHERE tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff'')))';
  EXECUTE 'CREATE POLICY "certificate_images_delete_v2" ON certificate_images FOR DELETE USING (certificate_id IN (SELECT id FROM certificates WHERE tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'')))';
END IF;
END $$;

-- =============================================================
-- 12) market_vehicles (conditional + public listing)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_vehicles') THEN
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicles_select" ON market_vehicles';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicles_insert" ON market_vehicles';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicles_update" ON market_vehicles';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicles_delete" ON market_vehicles';

  EXECUTE 'CREATE POLICY "market_vehicles_select_v2" ON market_vehicles FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()) OR status = ''listed'')';
  EXECUTE 'CREATE POLICY "market_vehicles_insert_v2" ON market_vehicles FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "market_vehicles_update_v2" ON market_vehicles FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "market_vehicles_delete_v2" ON market_vehicles FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 13) market_vehicle_images (conditional)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_vehicle_images') THEN
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicle_images_select" ON market_vehicle_images';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicle_images_insert" ON market_vehicle_images';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_market_vehicle_images_delete" ON market_vehicle_images';

  EXECUTE 'CREATE POLICY "market_vehicle_images_select_v2" ON market_vehicle_images FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()) OR vehicle_id IN (SELECT id FROM market_vehicles WHERE status = ''listed''))';
  EXECUTE 'CREATE POLICY "market_vehicle_images_insert_v2" ON market_vehicle_images FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "market_vehicle_images_delete_v2" ON market_vehicle_images FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 14) market_inquiries (conditional, open insert for buyers)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_inquiries') THEN
  EXECUTE 'DROP POLICY IF EXISTS "seller can view own inquiries" ON market_inquiries';
  EXECUTE 'DROP POLICY IF EXISTS "anyone can create inquiry" ON market_inquiries';
  EXECUTE 'DROP POLICY IF EXISTS "seller can update own inquiries" ON market_inquiries';

  EXECUTE 'CREATE POLICY "market_inquiries_select_v2" ON market_inquiries FOR SELECT USING (seller_tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "market_inquiries_insert_v2" ON market_inquiries FOR INSERT WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "market_inquiries_update_v2" ON market_inquiries FOR UPDATE USING (seller_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(seller_tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "market_inquiries_delete_v2" ON market_inquiries FOR DELETE USING (seller_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(seller_tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 15) market_inquiry_messages (conditional)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_inquiry_messages') THEN
  EXECUTE 'DROP POLICY IF EXISTS "participants can view messages" ON market_inquiry_messages';
  EXECUTE 'DROP POLICY IF EXISTS "anyone can create messages" ON market_inquiry_messages';

  EXECUTE 'CREATE POLICY "market_inquiry_messages_select_v2" ON market_inquiry_messages FOR SELECT USING (inquiry_id IN (SELECT id FROM market_inquiries WHERE seller_tenant_id IN (SELECT my_tenant_ids())))';
  EXECUTE 'CREATE POLICY "market_inquiry_messages_insert_v2" ON market_inquiry_messages FOR INSERT WITH CHECK (true)';
END IF;
END $$;

-- =============================================================
-- 16) market_deals (conditional)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_deals') THEN
  EXECUTE 'DROP POLICY IF EXISTS "seller can view own deals" ON market_deals';
  EXECUTE 'DROP POLICY IF EXISTS "seller can manage own deals" ON market_deals';

  EXECUTE 'CREATE POLICY "market_deals_select_v2" ON market_deals FOR SELECT USING (seller_tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "market_deals_insert_v2" ON market_deals FOR INSERT WITH CHECK (seller_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(seller_tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "market_deals_update_v2" ON market_deals FOR UPDATE USING (seller_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(seller_tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "market_deals_delete_v2" ON market_deals FOR DELETE USING (seller_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(seller_tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 17) job_orders (conditional, dual-tenant)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_orders') THEN
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_select" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_insert" ON job_orders';
  EXECUTE 'DROP POLICY IF EXISTS "job_orders_update" ON job_orders';

  EXECUTE 'CREATE POLICY "job_orders_select_v2" ON job_orders FOR SELECT USING (from_tenant_id IN (SELECT my_tenant_ids()) OR to_tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "job_orders_insert_v2" ON job_orders FOR INSERT WITH CHECK (from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "job_orders_update_v2" ON job_orders FOR UPDATE USING ((from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin'',''staff'')) OR (to_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(to_tenant_id) IN (''owner'',''admin'',''staff'')))';
  EXECUTE 'CREATE POLICY "job_orders_delete_v2" ON job_orders FOR DELETE USING (from_tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(from_tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 18-19) stores / store_memberships (conditional)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores') THEN
  EXECUTE 'DROP POLICY IF EXISTS "stores_tenant_select" ON stores';
  EXECUTE 'DROP POLICY IF EXISTS "stores_tenant_manage" ON stores';
  EXECUTE 'CREATE POLICY "stores_select_v2" ON stores FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "stores_insert_v2" ON stores FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
  EXECUTE 'CREATE POLICY "stores_update_v2" ON stores FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
  EXECUTE 'CREATE POLICY "stores_delete_v2" ON stores FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_memberships') THEN
  EXECUTE 'DROP POLICY IF EXISTS "store_memberships_select" ON store_memberships';
  EXECUTE 'DROP POLICY IF EXISTS "store_memberships_manage" ON store_memberships';
  EXECUTE 'CREATE POLICY "store_memberships_select_v2" ON store_memberships FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "store_memberships_insert_v2" ON store_memberships FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
  EXECUTE 'CREATE POLICY "store_memberships_update_v2" ON store_memberships FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
  EXECUTE 'CREATE POLICY "store_memberships_delete_v2" ON store_memberships FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 20-21) brands / coating_products (conditional, platform-common rows)
-- =============================================================
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands') THEN
  EXECUTE 'DROP POLICY IF EXISTS "brands_select" ON brands';
  EXECUTE 'DROP POLICY IF EXISTS "brands_insert" ON brands';
  EXECUTE 'DROP POLICY IF EXISTS "brands_update" ON brands';
  EXECUTE 'DROP POLICY IF EXISTS "brands_delete" ON brands';

  EXECUTE 'CREATE POLICY "brands_select_v2" ON brands FOR SELECT USING (tenant_id IS NULL OR tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "brands_insert_v2" ON brands FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "brands_update_v2" ON brands FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "brands_delete_v2" ON brands FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coating_products') THEN
  EXECUTE 'DROP POLICY IF EXISTS "coating_products_select" ON coating_products';
  EXECUTE 'DROP POLICY IF EXISTS "coating_products_insert" ON coating_products';
  EXECUTE 'DROP POLICY IF EXISTS "coating_products_update" ON coating_products';
  EXECUTE 'DROP POLICY IF EXISTS "coating_products_delete" ON coating_products';

  EXECUTE 'CREATE POLICY "coating_products_select_v2" ON coating_products FOR SELECT USING (tenant_id IS NULL OR tenant_id IN (SELECT my_tenant_ids()))';
  EXECUTE 'CREATE POLICY "coating_products_insert_v2" ON coating_products FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "coating_products_update_v2" ON coating_products FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin'',''staff''))';
  EXECUTE 'CREATE POLICY "coating_products_delete_v2" ON coating_products FOR DELETE USING (tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN (''owner'',''admin''))';
END IF;
END $$;

-- =============================================================
-- 22) tenant_memberships (special: owner only for mutations)
-- =============================================================
DROP POLICY IF EXISTS "tm_select_own" ON tenant_memberships;

CREATE POLICY "tenant_memberships_select_v2" ON tenant_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "tenant_memberships_insert_v2" ON tenant_memberships
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) = 'owner'
  );

CREATE POLICY "tenant_memberships_update_v2" ON tenant_memberships
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) = 'owner'
  );

CREATE POLICY "tenant_memberships_delete_v2" ON tenant_memberships
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) = 'owner'
  );

-- =============================================================
-- 23) tenants (special: owner only for UPDATE)
-- =============================================================
DROP POLICY IF EXISTS "tenant_select_own" ON tenants;

CREATE POLICY "tenants_select_v2" ON tenants
  FOR SELECT USING (id IN (SELECT my_tenant_ids()));

CREATE POLICY "tenants_update_v2" ON tenants
  FOR UPDATE USING (
    id IN (SELECT my_tenant_ids())
    AND my_tenant_role(id) = 'owner'
  );

-- =============================================================
-- 24) insurer_access_logs (special: insurer_users only)
-- =============================================================
DROP POLICY IF EXISTS "ial_insert" ON insurer_access_logs;

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'insurer_users') THEN
  EXECUTE 'CREATE POLICY "insurer_access_logs_insert_v2" ON insurer_access_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM insurer_users WHERE user_id = auth.uid() AND is_active = true))';
ELSE
  -- Fallback: keep restrictive if insurer_users doesn't exist
  EXECUTE 'CREATE POLICY "insurer_access_logs_insert_v2" ON insurer_access_logs FOR INSERT WITH CHECK (false)';
END IF;
END $$;

-- Cleanup: drop the helper function (one-time use)
DROP FUNCTION IF EXISTS _apply_standard_rls(text, text[]);
