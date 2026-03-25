-- =============================================================
-- Insurer Onboarding V2 — Additional features
-- P2-18: Log retention policy
-- P2-19/M-7: Insurer withdrawal (complete deletion)
-- M-1: Slug generation retry
-- M-4: Agency/referral registration support
-- M-6: Corporate number validation support
-- =============================================================

-- =============================================================
-- P2-18: insurer_access_logs retention policy
-- Auto-delete logs older than 90 days via scheduled cleanup
-- =============================================================
create or replace function cleanup_insurer_access_logs(p_retention_days integer default 90)
returns integer
language plpgsql security definer
as $$
declare
  v_deleted integer;
begin
  delete from insurer_access_logs
  where created_at < now() - (p_retention_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Also cleanup old email verification codes (older than 24h)
create or replace function cleanup_insurer_email_verifications()
returns integer
language plpgsql security definer
as $$
declare
  v_deleted integer;
begin
  delete from insurer_email_verifications
  where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Also cleanup old admin audit logs (older than 365 days)
create or replace function cleanup_admin_audit_logs(p_retention_days integer default 365)
returns integer
language plpgsql security definer
as $$
declare
  v_deleted integer;
begin
  delete from admin_audit_logs
  where created_at < now() - (p_retention_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- =============================================================
-- M-4: Agency / referral registration support
-- =============================================================
alter table insurers
  add column if not exists referral_code text,
  add column if not exists agency_id uuid;

-- Update signup_source check to include new values
-- (Can't easily ALTER CHECK constraints, so we add a new constraint)
do $$
begin
  -- Drop old constraint if exists (it was just a default, not a CHECK)
  -- signup_source had no formal CHECK constraint, just a default
  -- Add CHECK constraint now
  if not exists (
    select 1 from pg_constraint where conname = 'insurers_signup_source_check'
  ) then
    alter table insurers add constraint insurers_signup_source_check
      check (signup_source in ('manual', 'self', 'referral', 'agency'));
  end if;
end $$;

-- =============================================================
-- M-6: Corporate number validation (prep for API integration)
-- Add index for lookup (guard: column must exist from 20260325000000)
-- =============================================================
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'insurers' and column_name = 'corporate_number'
  ) then
    create index if not exists idx_insurers_corporate_number
      on insurers (corporate_number)
      where corporate_number is not null;
  end if;
end $$;

-- =============================================================
-- M-1: Slug generation with retry (replace register_insurer_v2)
-- =============================================================
create or replace function generate_insurer_slug(p_company_name text)
returns text
language plpgsql
as $$
declare
  v_base text;
  v_slug text;
  v_suffix text;
  v_attempt integer := 0;
begin
  v_base := regexp_replace(lower(p_company_name), '[^a-z0-9\s-]', '', 'g');
  v_base := regexp_replace(trim(v_base), '\s+', '-', 'g');
  v_base := regexp_replace(v_base, '-+', '-', 'g');
  if v_base = '' then v_base := 'insurer'; end if;

  loop
    v_attempt := v_attempt + 1;
    v_suffix := substr(md5(random()::text || v_attempt::text), 1, 8);
    v_slug := v_base || '-' || v_suffix;

    -- Check uniqueness
    if not exists (select 1 from insurers where slug = v_slug) then
      return v_slug;
    end if;

    -- Safety: max 10 attempts
    if v_attempt >= 10 then
      raise exception 'slug_generation_failed: Could not generate unique slug after 10 attempts';
    end if;
  end loop;
end;
$$;

-- Update register_insurer_v2 to use the new slug generator
create or replace function register_insurer_v2(
  p_email              text,
  p_password           text,
  p_company_name       text,
  p_contact_person     text,
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
  v_user_id uuid;
  v_insurer_id uuid;
  v_slug text;
  v_signup_source text;
begin
  -- Validate terms acceptance
  if not p_terms_accepted then
    raise exception 'terms_not_accepted: 利用規約への同意が必要です';
  end if;

  -- Check email not already used
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    raise exception 'email_exists: このメールアドレスは既に登録されています';
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

  -- 1) Create auth user
  v_user_id := extensions.uuid_generate_v4();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('display_name', p_contact_person),
    now(), now(), '', false
  );

  -- Also create identity record
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id, v_user_id, lower(p_email), 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email)),
    now(), now(), now()
  );

  -- 2) Create insurer record
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

  -- 3) Create insurer_users record (first user = admin)
  insert into insurer_users (insurer_id, user_id, role, display_name, is_active)
  values (v_insurer_id, v_user_id, 'admin', p_contact_person, true);

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'insurer_id', v_insurer_id
  );
end;
$$;

-- =============================================================
-- P2-19 / M-7: Insurer withdrawal (complete deletion)
-- Deletes all insurer data including users and audit logs.
-- Must be called by platform admin only (via service role key).
-- =============================================================
create or replace function withdraw_insurer(p_insurer_id uuid)
returns jsonb
language plpgsql security definer
as $$
declare
  v_user_ids uuid[];
  v_insurer_name text;
  v_deleted_users integer;
  v_deleted_logs integer;
begin
  -- Get insurer name for logging
  select name into v_insurer_name from insurers where id = p_insurer_id;
  if v_insurer_name is null then
    raise exception 'insurer_not_found: 指定された加盟店が見つかりません';
  end if;

  -- Collect user_ids before deletion (for auth.users cleanup)
  select array_agg(user_id) into v_user_ids
  from insurer_users
  where insurer_id = p_insurer_id;

  -- Delete insurer_access_logs (FK cascade would do this, but be explicit)
  delete from insurer_access_logs where insurer_id = p_insurer_id;
  get diagnostics v_deleted_logs = row_count;

  -- Delete insurer_users (FK cascade)
  delete from insurer_users where insurer_id = p_insurer_id;
  get diagnostics v_deleted_users = row_count;

  -- Delete insurer record
  delete from insurers where id = p_insurer_id;

  -- Delete auth users that are no longer associated with any insurer or tenant
  if v_user_ids is not null then
    for i in 1..array_length(v_user_ids, 1) loop
      -- Only delete if user has no other memberships
      if not exists (
        select 1 from insurer_users where user_id = v_user_ids[i]
        union all
        select 1 from tenant_memberships where user_id = v_user_ids[i]
      ) then
        delete from auth.identities where user_id = v_user_ids[i];
        delete from auth.users where id = v_user_ids[i];
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'insurer_name', v_insurer_name,
    'deleted_users', v_deleted_users,
    'deleted_logs', v_deleted_logs
  );
end;
$$;

-- =============================================================
-- P2-20: Onboarding tracking
-- Track whether the initial setup wizard has been completed
-- =============================================================
alter table insurers
  add column if not exists onboarding_completed_at timestamptz;
