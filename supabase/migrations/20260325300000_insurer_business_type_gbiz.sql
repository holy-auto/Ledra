-- =============================================================
-- Add business_type to insurers + update RPC for GBiz support
-- business_type: 'corporation' (法人) or 'sole_proprietor' (個人事業主)
-- 法人の場合 corporate_number は必須
-- =============================================================

-- 1) Add business_type column
alter table insurers
  add column if not exists business_type text not null default 'corporation'
    check (business_type in ('corporation', 'sole_proprietor'));

-- 2) Add unique index on corporate_number (non-null only) to prevent duplicates
create unique index if not exists idx_insurers_corporate_number_unique
  on insurers (corporate_number) where corporate_number is not null;

-- 3) Update create_insurer_for_user RPC to accept business_type
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
  p_agency_id          uuid default null,
  p_business_type      text default 'corporation'
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

  -- Validate business_type
  if p_business_type not in ('corporation', 'sole_proprietor') then
    raise exception 'invalid_business_type: 事業形態が不正です';
  end if;

  -- 法人の場合、法人番号は必須
  if p_business_type = 'corporation' and (p_corporate_number is null or p_corporate_number = '') then
    raise exception 'corporate_number_required: 法人の場合、法人番号は必須です';
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
    id, name, slug, is_active, status, business_type,
    requested_plan, contact_person, contact_email, contact_phone,
    corporate_number, address, representative_name,
    terms_accepted_at, signup_source, referral_code, agency_id
  ) values (
    gen_random_uuid(), p_company_name, v_slug, true, 'active_pending_review', p_business_type,
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
