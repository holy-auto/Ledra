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
-- 【後から内容だけ修正】ここで権限を締める関数のうち auth_uid_by_email / get_auth_email /
-- get_auth_email_scoped は**本番にしかなく**、マイグレーションでは 20260826000005
-- （ずっと後ろ）でしか作られない。無い関数への revoke/grant は落ちるので、
-- あるものだけ処理する。版番号は変えていないので本番への影響は無い。
do $mig$
declare
  sig text;
begin
  foreach sig in array array[
    'public.auth_uid_by_email(text)',
    'public.get_auth_email(uuid)',
    'public.get_auth_email_scoped(uuid)',
    'public.get_auth_emails_by_ids(uuid[])',
    'public.check_auth_email_exists(text)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', sig);
      execute format('grant  execute on function %s to service_role', sig);
    end if;
  end loop;
end
$mig$;





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
-- 【後から内容だけ修正】`line_link_tokens` / `line_pending_links` は**本番にしか無い**
-- （どのマイグレーションも作っていない。`20260603010000_fk_covering_indexes.sql` の
-- コメントにも「ドリフト」テーブルとして列挙されている）。
--
-- `DROP POLICY IF EXISTS ... ON <欠けたテーブル>` は **PostgreSQL 16 では NOTICE で
-- skip されるが、15 では `relation does not exist (SQLSTATE 42P01)` で落ちる。**
-- 手元の再生は 16、Supabase は 15 なので、手元では一度も再現しなかった。
-- to_regclass で見てから実行する（版に依存しない）。
do $mig$
declare
  t text;
begin
  foreach t in array array['public.line_link_tokens', 'public.line_pending_links'] loop
    if to_regclass(t) is not null then
      execute format('drop policy if exists service_role_all_%s on %s', split_part(t, '.', 2), t);
    end if;
  end loop;
end
$mig$;

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
