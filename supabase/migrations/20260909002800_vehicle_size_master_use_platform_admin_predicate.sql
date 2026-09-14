-- ============================================================
-- code-review 指摘 (2026-09-09): G-M5是正（20260908132157）で
-- vehicle_size_master の書込みポリシーを is_super_admin_user() でガードした
-- が、この関数は tenant_id を見ない（role='super_admin' の membership が
-- どのテナントにあっても true）。運営テナント外に super_admin membership
-- があれば全テナント共有の料金マスタを書き換え・削除できてしまい、逆に
-- 運営テナントの owner/admin は弾かれる。20260908234500 で新設した
-- is_platform_admin()（アプリ層 isPlatformAdmin() と同じ判定）に揃える。
-- ============================================================

drop policy if exists vehicle_size_master_admin_all on vehicle_size_master;
create policy vehicle_size_master_admin_all on vehicle_size_master
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
