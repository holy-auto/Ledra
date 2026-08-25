-- ============================================================
-- 本番へ適用済みのファイル。記録バージョン = このファイル名（20260823235804）。
-- 経緯・方針・対象の選び方は 20260823170000_revoke_anon_from_secdef_rpcs.sql の
-- ヘッダに残してある（そちらは中身を空にしたポインタ）。
--
-- 適用後に has_function_privilege で実測し、対象 16 本すべて anon = false、
-- 呼び出し元の検査が無い4本とトリガ専用2本は authenticated も false、
-- service_role のみ true、RLS ポリシー内で使う 19 本は anon 実行可のまま、を確認済み。
-- revoke/grant は冪等なので、再適用しても実害は無い。
-- ============================================================

do $$
declare
  r record;
  -- (A) service_role だけが呼べればよい
  server_only text[] := array[
    'pos_checkout', 'upsert_agent_user', 'billing_analytics_stats', 'management_kpi_stats'
  ];
  -- (B) 利用者トークンで呼ぶ必要がある（anon だけ落とす）
  user_token text[] := array[
    'replace_staff_shifts',   -- 内部で auth.uid() と tenant_memberships を見ている
    'insurer_audit_log',      -- 内部で auth.uid() を見ている
    'dashboard_tenant_stats', -- 内部で membership を見ている
    'agent_dashboard_stats',  -- 内部で auth.uid() を見ている
    'agent_rankings',
    'platform_agent_count', 'platform_insurer_count', 'platform_certificate_stats',
    'platform_regional_stats', 'platform_tenant_category_stats'
  ];
  -- (C) トリガ専用
  trigger_only text[] := array['certificate_versions_no_update', 'webauthn_assertions_no_update'];
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(server_only || user_token || trigger_only)
  loop
    if r.proname = any(server_only) then
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
      execute format('grant  execute on function %s to service_role', r.sig);
    elsif r.proname = any(user_token) then
      execute format('revoke execute on function %s from public, anon', r.sig);
      execute format('grant  execute on function %s to authenticated, service_role', r.sig);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    end if;
  end loop;
end $$;
