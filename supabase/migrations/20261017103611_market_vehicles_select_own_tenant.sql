-- マーケットの車両（market_vehicles）と画像（market_vehicle_images）の参照を、自分のテナントの行だけに絞る。
--
-- 以前は 20260323020000_rls_role_constraints.sql の
--   market_vehicles_select_v2       : tenant_id IN my_tenant_ids() OR status = 'listed'
--   market_vehicle_images_select_v2 : tenant_id IN my_tenant_ids() OR vehicle_id IN (出品中の車両)
-- で、ロールを絞っていなかった。そのため**未ログイン（anon キー）でも** PostgREST から出品中の全車両の全列
-- （仕入原価 cost_price・仕入先 supplier_name・仕入日・成約価格・買主情報 buyer_info・車台番号・ナンバー）を読めた。
-- ログインしていれば、他テナントの同じ列も読めた（/market の画面が select("*") でそのまま受け取っていた）。
-- アプリの /market はログイン必須（src/app/market/page.tsx）で、他テナントに見せる想定の列は車両の仕様と販売価格だけ。
--
-- 読む経路（2026-10-17 に全経路を確認）:
--   - 自社の在庫（/admin/market-vehicles、/api/admin/market-vehicles）: 利用者のクライアントで自分の tenant_id を読む
--     → my_tenant_ids() で通る
--   - 他テナントの出品中の車両（/market・/market/[id]）: 同じ PR で service role に替え、出品中の行と
--     公開してよい列だけを読む（src/lib/market/listingColumns.ts）。workshop_capability_profiles
--     （20261012222500）と同じ形
--   - 問い合わせ・商談（/api/market/*）: 元から service role（createTenantScopedAdmin / createServiceRoleAdmin）
--     → RLS を通らないので影響しない
-- 書き込みのポリシー（insert / update / delete _v2）は元から自分のテナントのロール付きで、変えない。

DROP POLICY IF EXISTS "market_vehicles_select_v2" ON market_vehicles;
CREATE POLICY "market_vehicles_select_v2" ON market_vehicles
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT my_tenant_ids()));

DROP POLICY IF EXISTS "market_vehicle_images_select_v2" ON market_vehicle_images;
CREATE POLICY "market_vehicle_images_select_v2" ON market_vehicle_images
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT my_tenant_ids()));
