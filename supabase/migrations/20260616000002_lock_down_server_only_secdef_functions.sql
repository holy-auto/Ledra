-- Security advisory remediation — anon/authenticated executable SECURITY DEFINER
-- functions (WARN 0028 / 0029), server-only subset.
--
-- Each function below is SECURITY DEFINER, is invoked exclusively through the
-- service-role client in the application (verified by a full audit of every
-- `.rpc(...)` call site in src/), and is NOT referenced by any RLS policy
-- expression. Revoking client EXECUTE therefore removes the anon/authenticated
-- attack surface without affecting application behaviour; service_role retains
-- EXECUTE.
--
-- Intentionally NOT touched (remain executable by authenticated by design):
--   * RLS helper functions (my_tenant_ids, current_tenant_id, is_member_of_tenant,
--     member_role_in_tenant, my_*_ids, is_*_admin, …) — evaluated inside RLS
--     policies, so they must stay executable.
--   * Client-facing RPCs called with a user token (agent_dashboard_stats,
--     dashboard_tenant_stats, management_kpi_stats, billing_analytics_stats,
--     platform_*, get_my_*, insurer_* portal functions, pos_checkout,
--     upsert_agent_user, register_insurer_v2 public signup, …).

-- helper: revoke from every client role + PUBLIC, keep service_role
-- (written out per-function so the exact overload signatures are explicit)

revoke execute on function public.approve_agent_application(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.approve_agent_application(uuid, uuid, uuid) to service_role;

revoke execute on function public.cleanup_admin_audit_logs(integer) from public, anon, authenticated;
grant  execute on function public.cleanup_admin_audit_logs(integer) to service_role;

revoke execute on function public.cleanup_insurer_access_logs(integer) from public, anon, authenticated;
grant  execute on function public.cleanup_insurer_access_logs(integer) to service_role;

revoke execute on function public.cleanup_insurer_email_verifications() from public, anon, authenticated;
grant  execute on function public.cleanup_insurer_email_verifications() to service_role;

revoke execute on function public.create_insurer_for_user(uuid, text, text, text, text, text, text, text, text, boolean, text, uuid) from public, anon, authenticated;
grant  execute on function public.create_insurer_for_user(uuid, text, text, text, text, text, text, text, text, boolean, text, uuid) to service_role;

revoke execute on function public.create_insurer_for_user(uuid, text, text, text, text, text, text, text, text, boolean, text, uuid, text) from public, anon, authenticated;
grant  execute on function public.create_insurer_for_user(uuid, text, text, text, text, text, text, text, text, boolean, text, uuid, text) to service_role;

revoke execute on function public.dashboard_summary_counts(uuid) from public, anon, authenticated;
grant  execute on function public.dashboard_summary_counts(uuid) to service_role;

revoke execute on function public.increment_intake_ocr_attempts(uuid) from public, anon, authenticated;
grant  execute on function public.increment_intake_ocr_attempts(uuid) to service_role;

revoke execute on function public.increment_referral_link_click(text) from public, anon, authenticated;
grant  execute on function public.increment_referral_link_click(text) to service_role;

revoke execute on function public.marketing_churn_stats() from public, anon, authenticated;
grant  execute on function public.marketing_churn_stats() to service_role;

revoke execute on function public.part_register_serial(text, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.part_register_serial(text, uuid, uuid) to service_role;

revoke execute on function public.refresh_partner_score(uuid) from public, anon, authenticated;
grant  execute on function public.refresh_partner_score(uuid) to service_role;

revoke execute on function public.upsert_insurer_user(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.upsert_insurer_user(uuid, text, text, text) to service_role;

revoke execute on function public.withdraw_insurer(uuid) from public, anon, authenticated;
grant  execute on function public.withdraw_insurer(uuid) to service_role;

-- SECURITY DEFINER trigger function: only ever fires from its trigger, never
-- called via RPC, so client EXECUTE is unnecessary.
revoke execute on function public.fn_sync_mileage_from_certificate() from public, anon, authenticated;
grant  execute on function public.fn_sync_mileage_from_certificate() to service_role;
