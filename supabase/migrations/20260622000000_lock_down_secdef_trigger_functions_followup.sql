-- Security advisory remediation — anon/authenticated executable SECURITY DEFINER
-- functions (WARN 0028 / 0029), trigger / event-trigger follow-up subset.
--
-- Follow-up to 20260616000004_lock_down_secdef_trigger_functions.sql. The
-- functions below are SECURITY DEFINER and only ever run from a trigger (or an
-- event trigger); they are never invoked via RPC. A trigger fires in the
-- context of the statement that touches its table — the invoking role does NOT
-- need EXECUTE on the function — so revoking client EXECUTE has no functional
-- effect beyond removing the ability to call them directly through PostgREST
-- (which would error anyway). service_role keeps EXECUTE.
--
-- The two row-level trigger functions shipped after 20260616000004 and so were
-- never covered by it. rls_auto_enable() is a DDL event-trigger function.
--
-- Intentionally NOT touched (remain executable by design, as documented in
-- 20260616000000 / 20260616000002):
--   * RLS helper functions (my_tenant_ids, current_tenant_id, is_member_of_tenant,
--     member_role_in_tenant, my_*_ids, is_*_admin, certificate_public_tenant, …)
--     — evaluated inside RLS policy expressions, so they must stay executable.
--   * Client-facing RPCs called with a user token (replace_staff_shifts,
--     upsert_agent_user, agent_dashboard_stats, dashboard_tenant_stats,
--     management_kpi_stats, billing_analytics_stats, platform_*, get_my_*,
--     insurer_* portal functions, pos_checkout, register_insurer_v2, …).

-- Row-level SECURITY DEFINER trigger functions (return type `trigger`).
-- 【後から内容だけ修正】この関数を作る 20260617000004 が空 DB では落ちることがあり、
-- その場合ここが連鎖して落ちる。あるときだけ実行する。
do $mig$
begin
  if to_regprocedure('public.certificates_check_craftsman_tenant()') is not null then
    revoke execute on function public.certificates_check_craftsman_tenant() from public, anon, authenticated;
    grant  execute on function public.certificates_check_craftsman_tenant() to service_role;
  end if;
end
$mig$;

revoke execute on function public.reservations_check_tenant_refs() from public, anon, authenticated;
grant  execute on function public.reservations_check_tenant_refs() to service_role;

-- DDL event-trigger function. Present in the live database but not created by a
-- repo migration, so guard the grant changes behind an existence check to keep
-- a from-scratch migration run (where the function is absent) working.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    grant  execute on function public.rls_auto_enable() to service_role;
  end if;
end $$;
