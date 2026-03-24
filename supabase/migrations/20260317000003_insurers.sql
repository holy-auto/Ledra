-- =============================================================
-- Insurers & Insurer Users Migration
-- Creates the foundational tables and RPC functions for
-- the insurer (保険会社) portal.
-- =============================================================

-- =============================================================
-- 1) insurers — 保険会社エンティティ
-- =============================================================
create table if not exists insurers (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text unique,
  plan_tier              text not null default 'basic'
                           check (plan_tier in ('basic', 'pro', 'enterprise')),
  is_active              boolean not null default true,
  stripe_customer_id     text,
  stripe_subscription_id text,
  contact_email          text,
  contact_phone          text,
  address                text,
  max_users              integer not null default 5,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_insurers_slug on insurers (slug);
create index if not exists idx_insurers_stripe on insurers (stripe_customer_id) where stripe_customer_id is not null;

-- =============================================================
-- 2) insurer_users — 保険会社ユーザー（スタッフ）
-- =============================================================
create table if not exists insurer_users (
  id           uuid primary key default gen_random_uuid(),
  insurer_id   uuid not null references insurers (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'viewer'
                 check (role in ('admin', 'viewer', 'auditor')),
  display_name text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (insurer_id, user_id)
);

create index if not exists idx_iu_user on insurer_users (user_id);
create index if not exists idx_iu_insurer on insurer_users (insurer_id);

-- =============================================================
-- 3) FK constraints for insurer_access_logs
--    (table already exists in core_tables migration)
-- =============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_ial_insurer'
  ) then
    alter table insurer_access_logs
      add constraint fk_ial_insurer
      foreign key (insurer_id) references insurers (id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_ial_insurer_user'
  ) then
    alter table insurer_access_logs
      add constraint fk_ial_insurer_user
      foreign key (insurer_user_id) references insurer_users (id) on delete cascade;
  end if;
end $$;

-- =============================================================
-- 4) RLS for insurers & insurer_users
-- =============================================================
alter table insurers enable row level security;
alter table insurer_users enable row level security;

-- Helper: get insurer_ids the current user belongs to
create or replace function my_insurer_ids()
returns setof uuid
language sql stable security definer
as $$
  select insurer_id
  from insurer_users
  where user_id = auth.uid()
    and is_active = true;
$$;

-- insurers: read own insurer
create policy "insurers_select" on insurers
  for select using (id in (select my_insurer_ids()));

-- insurer_users: read own insurer's members
create policy "iu_select" on insurer_users
  for select using (insurer_id in (select my_insurer_ids()));

-- insurer_users: admin can insert/update within own insurer
create policy "iu_insert" on insurer_users
  for insert with check (
    insurer_id in (select my_insurer_ids())
    and exists (
      select 1 from insurer_users iu
      where iu.user_id = auth.uid()
        and iu.insurer_id = insurer_users.insurer_id
        and iu.role = 'admin'
        and iu.is_active = true
    )
  );

create policy "iu_update" on insurer_users
  for update using (
    insurer_id in (select my_insurer_ids())
    and exists (
      select 1 from insurer_users iu
      where iu.user_id = auth.uid()
        and iu.insurer_id = insurer_users.insurer_id
        and iu.role = 'admin'
        and iu.is_active = true
    )
  );

-- =============================================================
-- 5) RPC: is_insurer_admin()
--    Returns true if current user has admin role in any insurer
-- =============================================================
create or replace function is_insurer_admin()
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from insurer_users
    where user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

-- =============================================================
-- 6) RPC: insurer_search_certificates
--    Searches certificates accessible to the insurer user.
--    For now, insurers can search ALL active certificates
--    (cross-tenant access is the purpose of the insurer portal).
-- =============================================================
drop function if exists insurer_search_certificates(text, integer, integer, text, text);
create or replace function insurer_search_certificates(
  p_query      text default '',
  p_limit      integer default 50,
  p_offset     integer default 0,
  p_ip         text default null,
  p_user_agent text default null
)
returns table (
  public_id      text,
  status         text,
  customer_name  text,
  vehicle_model  text,
  vehicle_plate  text,
  created_at     timestamptz,
  tenant_id      uuid,
  tenant_name    text
)
language plpgsql security definer
as $$
declare
  v_insurer_user_id uuid;
  v_insurer_id uuid;
begin
  -- Verify caller is an active insurer user
  select iu.id, iu.insurer_id
  into v_insurer_user_id, v_insurer_id
  from insurer_users iu
  where iu.user_id = auth.uid()
    and iu.is_active = true
  limit 1;

  if v_insurer_user_id is null then
    raise exception 'Not an active insurer user';
  end if;

  -- Log the search action
  insert into insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  values (
    v_insurer_id,
    v_insurer_user_id,
    'search',
    jsonb_build_object('query', p_query, 'limit', p_limit, 'offset', p_offset),
    p_ip,
    p_user_agent
  );

  -- Return matching certificates
  return query
    select
      c.public_id,
      c.status,
      c.customer_name,
      coalesce(v.model, c.vehicle_info_json->>'model', '') as vehicle_model,
      coalesce(v.plate_display, c.vehicle_info_json->>'plate_display', '') as vehicle_plate,
      c.created_at,
      c.tenant_id,
      t.name as tenant_name
    from certificates c
    left join vehicles v on v.id = c.vehicle_id
    left join tenants t on t.id = c.tenant_id
    where
      c.status in ('active', 'void')
      and (
        p_query = ''
        or c.public_id ilike '%' || p_query || '%'
        or c.customer_name ilike '%' || p_query || '%'
        or coalesce(v.model, '') ilike '%' || p_query || '%'
        or coalesce(v.plate_display, '') ilike '%' || p_query || '%'
        or coalesce(c.vehicle_info_json->>'model', '') ilike '%' || p_query || '%'
        or coalesce(c.vehicle_info_json->>'plate_display', '') ilike '%' || p_query || '%'
      )
    order by c.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

-- =============================================================
-- 7) RPC: insurer_get_certificate
--    Get a single certificate by public_id (for PDF export)
-- =============================================================
drop function if exists insurer_get_certificate(text, text, text);
create or replace function insurer_get_certificate(
  p_public_id  text,
  p_ip         text default null,
  p_user_agent text default null
)
returns table (
  id             uuid,
  public_id      text,
  status         text,
  customer_name  text,
  vehicle_model  text,
  vehicle_plate  text,
  service_type   text,
  certificate_no text,
  content_free_text text,
  created_at     timestamptz,
  tenant_id      uuid,
  tenant_name    text
)
language plpgsql security definer
as $$
declare
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_cert_id uuid;
begin
  -- Verify caller is an active insurer user
  select iu.id, iu.insurer_id
  into v_insurer_user_id, v_insurer_id
  from insurer_users iu
  where iu.user_id = auth.uid()
    and iu.is_active = true
  limit 1;

  if v_insurer_user_id is null then
    raise exception 'Not an active insurer user';
  end if;

  -- Get certificate ID for audit log
  select c.id into v_cert_id
  from certificates c
  where c.public_id = p_public_id
  limit 1;

  -- Log the view action
  insert into insurer_access_logs (insurer_id, insurer_user_id, certificate_id, action, meta, ip, user_agent)
  values (
    v_insurer_id,
    v_insurer_user_id,
    v_cert_id,
    'view',
    jsonb_build_object('public_id', p_public_id),
    p_ip,
    p_user_agent
  );

  return query
    select
      c.id,
      c.public_id,
      c.status,
      c.customer_name,
      coalesce(v.model, c.vehicle_info_json->>'model', '') as vehicle_model,
      coalesce(v.plate_display, c.vehicle_info_json->>'plate_display', '') as vehicle_plate,
      c.service_type,
      c.certificate_no,
      c.content_free_text,
      c.created_at,
      c.tenant_id,
      t.name as tenant_name
    from certificates c
    left join vehicles v on v.id = c.vehicle_id
    left join tenants t on t.id = c.tenant_id
    where c.public_id = p_public_id
    limit 1;
end;
$$;

-- =============================================================
-- 8) RPC: insurer_audit_log
--    Generic audit logging for insurer actions
-- =============================================================
create or replace function insurer_audit_log(
  p_action           text,
  p_target_public_id text default null,
  p_query_json       jsonb default null,
  p_ip               text default null,
  p_user_agent       text default null
)
returns void
language plpgsql security definer
as $$
declare
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_cert_id uuid;
begin
  -- Verify caller is an active insurer user
  select iu.id, iu.insurer_id
  into v_insurer_user_id, v_insurer_id
  from insurer_users iu
  where iu.user_id = auth.uid()
    and iu.is_active = true
  limit 1;

  if v_insurer_user_id is null then
    raise exception 'Not an active insurer user';
  end if;

  -- Resolve certificate_id from public_id if provided
  if p_target_public_id is not null then
    select c.id into v_cert_id
    from certificates c
    where c.public_id = p_target_public_id
    limit 1;
  end if;

  insert into insurer_access_logs (insurer_id, insurer_user_id, certificate_id, action, meta, ip, user_agent)
  values (
    v_insurer_id,
    v_insurer_user_id,
    v_cert_id,
    p_action,
    coalesce(p_query_json, '{}'::jsonb),
    p_ip,
    p_user_agent
  );
end;
$$;

-- =============================================================
-- 9) RPC: upsert_insurer_user
--    Creates or updates an insurer user by email lookup
-- =============================================================
create or replace function upsert_insurer_user(
  p_insurer_id   uuid,
  p_email        text,
  p_role         text default 'viewer',
  p_display_name text default null
)
returns uuid
language plpgsql security definer
as $$
declare
  v_user_id uuid;
  v_iu_id uuid;
begin
  -- Lookup auth user by email
  select au.id into v_user_id
  from auth.users au
  where lower(au.email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user not found for email: %', p_email;
  end if;

  -- Upsert insurer_users
  insert into insurer_users (insurer_id, user_id, role, display_name, is_active)
  values (p_insurer_id, v_user_id, p_role, p_display_name, true)
  on conflict (insurer_id, user_id)
  do update set
    role = excluded.role,
    display_name = coalesce(excluded.display_name, insurer_users.display_name),
    is_active = true,
    updated_at = now()
  returning id into v_iu_id;

  return v_iu_id;
end;
$$;

-- =============================================================
-- 10) updated_at triggers
-- =============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_insurers_updated_at') then
    create trigger trg_insurers_updated_at
      before update on insurers
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_insurer_users_updated_at') then
    create trigger trg_insurer_users_updated_at
      before update on insurer_users
      for each row execute function set_updated_at();
  end if;
end $$;

-- =============================================================
-- 11) Fix platform_insurer_count() from dashboard_enhancements
-- =============================================================
create or replace function platform_insurer_count()
returns bigint
language sql stable security definer
as $$
  select count(*) from insurers;
$$;
