-- =============================================================
-- Insurer Onboarding V2 — Audit fixes
-- C-1: Replace auth.users direct INSERT with SDK-compatible RPC
-- H-2: Add check_auth_email_exists helper
-- H-3: Fix admin_audit_logs RLS policy (remove current_setting dependency)
-- P1-9: Add get_auth_emails_by_ids batch helper
-- =============================================================

-- =============================================================
-- 1) check_auth_email_exists: Secure helper for email existence check
--    Used by /api/join/send-code to replace broken listUsers approach
-- =============================================================
create or replace function check_auth_email_exists(p_email text)
returns boolean
language plpgsql security definer
as $$
begin
  return exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
end;
$$;

-- =============================================================
-- 2) get_auth_emails_by_ids: Batch email lookup to eliminate N+1
--    Used by GET /api/insurer/users
-- =============================================================
create or replace function get_auth_emails_by_ids(p_user_ids uuid[])
returns table(id uuid, email text)
language plpgsql security definer
as $$
begin
  return query
    select u.id, u.email::text
    from auth.users u
    where u.id = any(p_user_ids);
end;
$$;

-- =============================================================
-- 3) create_insurer_for_user: New RPC that creates insurer +
--    insurer_users for an existing auth user (created via SDK).
--    Replaces register_insurer_v2's auth.users direct INSERT.
-- =============================================================
create or replace function create_insurer_for_user(
  p_user_id            uuid,
  p_company_name       text,
  p_contact_person     text,
  p_email              text,
  p_phone              text default '',
  p_requested_plan     text default 'basic',
  p_corporate_number   text default null,
  p_address            text default null,
  p_representative_name text default null,
  p_terms_accepted     boolean default false,
  p_referral_code      text default null,
  p_agency_id          uuid default null
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_insurer_id uuid;
  v_slug text;
  v_signup_source text;
begin
  -- Validate terms acceptance
  if not p_terms_accepted then
    raise exception 'terms_not_accepted: 利用規約への同意が必要です';
  end if;

  -- Generate unique slug with retry
  v_slug := generate_insurer_slug(p_company_name);

  -- Determine signup source
  if p_agency_id is not null then
    v_signup_source := 'agency';
  elsif p_referral_code is not null then
    v_signup_source := 'referral';
  else
    v_signup_source := 'self';
  end if;

  -- 1) Create insurer record
  insert into insurers (
    id, name, slug, is_active, status,
    requested_plan, contact_person, contact_email, contact_phone,
    corporate_number, address, representative_name,
    terms_accepted_at, signup_source, referral_code, agency_id
  ) values (
    gen_random_uuid(), p_company_name, v_slug, true, 'active_pending_review',
    p_requested_plan, p_contact_person, lower(p_email), nullif(p_phone, ''),
    nullif(p_corporate_number, ''), nullif(p_address, ''), nullif(p_representative_name, ''),
    case when p_terms_accepted then now() else null end,
    v_signup_source, nullif(p_referral_code, ''), p_agency_id
  )
  returning id into v_insurer_id;

  -- 2) Create insurer_users record (first user = admin)
  insert into insurer_users (insurer_id, user_id, role, display_name, is_active)
  values (v_insurer_id, p_user_id, 'admin', p_contact_person, true);

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'insurer_id', v_insurer_id
  );
end;
$$;

-- =============================================================
-- 4) Fix admin_audit_logs RLS policy
--    Replace current_setting('app.platform_tenant_id') with
--    a lookup table approach (platform_settings).
--    Since we already have PLATFORM_TENANT_ID as an env var in the
--    app, we create a helper function that admins can match against.
-- =============================================================

-- Create a platform config table to store the platform tenant ID
create table if not exists platform_config (
  key   text primary key,
  value text not null
);

-- Insert default (will be updated by deployment scripts)
insert into platform_config (key, value)
values ('platform_tenant_id', '00000000-0000-0000-0000-000000000000')
on conflict (key) do nothing;

-- Helper function to get platform tenant ID
create or replace function get_platform_tenant_id()
returns uuid
language sql stable security definer
as $$
  select value::uuid from platform_config where key = 'platform_tenant_id';
$$;

-- Drop old broken policy and create fixed one
drop policy if exists "aal_select_platform_admin" on admin_audit_logs;

create policy "aal_select_platform_admin" on admin_audit_logs
  for select using (
    exists (
      select 1 from tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = get_platform_tenant_id()
        and tm.role in ('admin', 'owner')
    )
  );

-- RLS for platform_config: read-only for authenticated, no public writes
alter table platform_config enable row level security;

create policy "platform_config_select" on platform_config
  for select using (true);
