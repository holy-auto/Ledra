-- Security advisory remediation — high-risk subset
--
-- Source: Supabase database linter (get_advisors, category=SECURITY) run 2026-06-16.
-- This migration addresses the single ERROR and the highest-risk WARN findings.
-- It intentionally does NOT touch RLS helper functions (current_tenant_id,
-- my_tenant_ids, is_member_of_tenant, …) — those are invoked from inside RLS
-- policies and must stay EXECUTE-able by anon/authenticated, nor the insurer_*
-- portal functions which perform their own internal access checks.
--
-- All affected app code paths use the service-role client
-- (createServiceRoleAdmin / createTenantScopedAdmin), which is unaffected by
-- the anon/authenticated EXECUTE revokes and bypasses RLS on the tightened
-- tables, so these changes do not alter application behaviour.

-- ---------------------------------------------------------------------------
-- 1) ERROR 0010 — public.invoices is a SECURITY DEFINER view.
--    Switch to SECURITY INVOKER so the querying user's RLS on `documents`
--    (which already has full *_v2 policies) is enforced instead of the
--    view creator's. The view is a plain projection of
--    documents WHERE doc_type = 'invoice'.
-- ---------------------------------------------------------------------------
alter view public.invoices set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 2) WARN 0028/0029 — PII / account-enumeration SECURITY DEFINER functions
--    callable by anon and authenticated. These read auth.users and are only
--    ever called server-side via the service-role client. Revoke client
--    execution (incl. the PUBLIC grant where present) and keep service_role.
-- ---------------------------------------------------------------------------
revoke execute on function public.auth_uid_by_email(text) from public, anon, authenticated;
grant  execute on function public.auth_uid_by_email(text) to service_role;

revoke execute on function public.get_auth_email(uuid) from public, anon, authenticated;
grant  execute on function public.get_auth_email(uuid) to service_role;

revoke execute on function public.get_auth_email_scoped(uuid) from public, anon, authenticated;
grant  execute on function public.get_auth_email_scoped(uuid) to service_role;

revoke execute on function public.get_auth_emails_by_ids(uuid[]) from public, anon, authenticated;
grant  execute on function public.get_auth_emails_by_ids(uuid[]) to service_role;

revoke execute on function public.check_auth_email_exists(text) from public, anon, authenticated;
grant  execute on function public.check_auth_email_exists(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) WARN 0024 — RLS policies with always-true USING/WITH CHECK on a write
--    command, which effectively bypass row-level security.
-- ---------------------------------------------------------------------------

-- 3a) line_link_tokens / line_pending_links: the lone policy on each table is
--     named "service_role_all_*" but was granted TO public with USING(true)/
--     WITH CHECK(true), exposing it to anon/authenticated. service_role bypasses
--     RLS, and no client (user-token) code touches these tables, so the broad
--     policy is pure over-exposure. Drop it; the table keeps RLS enabled with no
--     policy, denying anon/authenticated while service-role access is unchanged.
drop policy if exists service_role_all_line_link_tokens on public.line_link_tokens;
drop policy if exists service_role_all_line_pending_links on public.line_pending_links;

-- 3b) market_inquiries / market_inquiry_messages: INSERT policies used
--     WITH CHECK(true). Inquiries/replies are written by the service-role client
--     (RLS-bypassing) after server-side validation, so no app path needs the
--     permissive client policy. Replace with tenant-scoped checks that match the
--     existing *_select_v2 policies, in case a user-token insert is ever used.
drop policy if exists market_inquiries_insert_v2 on public.market_inquiries;
create policy market_inquiries_insert_v2 on public.market_inquiries
  for insert to authenticated
  with check (buyer_tenant_id in (select my_tenant_ids()));

drop policy if exists market_inquiry_messages_insert_v2 on public.market_inquiry_messages;
create policy market_inquiry_messages_insert_v2 on public.market_inquiry_messages
  for insert to authenticated
  with check (sender_tenant_id in (select my_tenant_ids()));
