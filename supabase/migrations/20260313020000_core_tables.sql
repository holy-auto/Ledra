-- =============================================================
-- Core Tables Migration
-- Creates the foundational tables for the CARTRUST/holy-cert SaaS.
-- Assumes Supabase (auth.users exists), pgcrypto extension enabled.
-- =============================================================

-- 0) Extensions
create extension if not exists "pgcrypto";

-- =============================================================
-- 1) tenants
-- =============================================================
create table if not exists tenants (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text unique,
  plan_tier        text not null default 'mini'
                     check (plan_tier in ('mini','standard','pro')),
  is_active        boolean not null default true,
  stripe_customer_id     text,
  stripe_subscription_id text,
  logo_asset_path  text,
  custom_domain    text,
  contact_email    text,
  contact_phone    text,
  address          text,
  website_url      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_tenants_slug on tenants (slug);
create index if not exists idx_tenants_stripe_customer on tenants (stripe_customer_id) where stripe_customer_id is not null;

-- =============================================================
-- 2) tenant_memberships
-- =============================================================
create table if not exists tenant_memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_tm_user on tenant_memberships (user_id);
create index if not exists idx_tm_tenant on tenant_memberships (tenant_id);

-- =============================================================
-- 3) vehicles
-- =============================================================
create table if not exists vehicles (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants (id) on delete cascade,
  maker                 text,
  model                 text,
  year                  integer,
  plate_display         text,
  customer_name         text,
  customer_email        text,
  customer_phone_masked text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_vehicles_tenant on vehicles (tenant_id);
create index if not exists idx_vehicles_plate on vehicles (tenant_id, plate_display) where plate_display is not null;

-- =============================================================
-- 4) certificates
-- =============================================================
create table if not exists certificates (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants (id) on delete cascade,
  public_id           text not null unique,
  vehicle_id          uuid references vehicles (id) on delete set null,
  status              text not null default 'active'
                        check (status in ('active','void','draft','expired')),
  customer_name       text not null default '',
  vehicle_info_json   jsonb default '{}'::jsonb,
  content_free_text   text,
  content_preset_json jsonb default '{}'::jsonb,
  expiry_type         text default 'text',
  expiry_value        text,
  certificate_no      text,
  service_type        text,
  footer_variant      text default 'holy',
  logo_asset_path     text,
  current_version     integer default 1,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_certs_tenant on certificates (tenant_id);
create index if not exists idx_certs_public_id on certificates (public_id);
create index if not exists idx_certs_vehicle on certificates (vehicle_id) where vehicle_id is not null;
create index if not exists idx_certs_status on certificates (tenant_id, status);

-- =============================================================
-- 5) certificate_images
-- =============================================================
create table if not exists certificate_images (
  id              uuid primary key default gen_random_uuid(),
  certificate_id  uuid not null references certificates (id) on delete cascade,
  storage_path    text not null,
  file_name       text,
  content_type    text,
  file_size       bigint default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_certimg_cert on certificate_images (certificate_id);

-- =============================================================
-- 6) templates
-- =============================================================
create table if not exists templates (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  scope          text not null default 'tenant',
  name           text not null,
  schema_json    jsonb not null default '{}'::jsonb,
  layout_version integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_templates_tenant on templates (tenant_id);

-- =============================================================
-- 7) vehicle_histories (audit log for vehicle events)
-- =============================================================
create table if not exists vehicle_histories (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  vehicle_id     uuid not null references vehicles (id) on delete cascade,
  certificate_id uuid references certificates (id) on delete set null,
  type           text not null,
  title          text not null,
  description    text,
  performed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_vh_vehicle on vehicle_histories (vehicle_id);
create index if not exists idx_vh_tenant on vehicle_histories (tenant_id);
create index if not exists idx_vh_cert on vehicle_histories (certificate_id) where certificate_id is not null;

-- =============================================================
-- 8) nfc_tags
-- =============================================================
create table if not exists nfc_tags (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  tag_code       text not null,
  uid            text unique,
  vehicle_id     uuid references vehicles (id) on delete set null,
  certificate_id uuid references certificates (id) on delete set null,
  status         text not null default 'prepared'
                   check (status in ('prepared','written','attached','lost','retired','error')),
  written_at     timestamptz,
  attached_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_nfc_tenant on nfc_tags (tenant_id);
create index if not exists idx_nfc_tag_code on nfc_tags (tag_code);
create index if not exists idx_nfc_vehicle on nfc_tags (vehicle_id) where vehicle_id is not null;

-- =============================================================
-- 9) insurer_access_logs
-- =============================================================
create table if not exists insurer_access_logs (
  id              uuid primary key default gen_random_uuid(),
  insurer_id      uuid not null,
  insurer_user_id uuid not null,
  certificate_id  uuid references certificates (id) on delete cascade,
  action          text not null,
  meta            jsonb default '{}'::jsonb,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ial_cert on insurer_access_logs (certificate_id);
create index if not exists idx_ial_insurer on insurer_access_logs (insurer_id);

-- =============================================================
-- 10) Row-Level Security (RLS) policies for core tables
-- =============================================================

-- Enable RLS on all tables
alter table tenants enable row level security;
alter table tenant_memberships enable row level security;
alter table vehicles enable row level security;
alter table certificates enable row level security;
alter table certificate_images enable row level security;
alter table templates enable row level security;
alter table vehicle_histories enable row level security;
alter table nfc_tags enable row level security;
alter table insurer_access_logs enable row level security;

-- Helper: get tenant_ids the current user belongs to
create or replace function my_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select tenant_id
  from public.tenant_memberships
  where user_id = auth.uid();
$$;

-- tenants: members can read their own tenant
create policy "tenant_select_own" on tenants
  for select using (id in (select my_tenant_ids()));

-- tenant_memberships: users can read their own memberships
create policy "tm_select_own" on tenant_memberships
  for select using (user_id = auth.uid());

-- vehicles: tenant members can CRUD
create policy "vehicles_select" on vehicles
  for select using (tenant_id in (select my_tenant_ids()));
create policy "vehicles_insert" on vehicles
  for insert with check (tenant_id in (select my_tenant_ids()));
create policy "vehicles_update" on vehicles
  for update using (tenant_id in (select my_tenant_ids()));
create policy "vehicles_delete" on vehicles
  for delete using (tenant_id in (select my_tenant_ids()));

-- certificates: tenant members can CRUD
create policy "certs_select" on certificates
  for select using (tenant_id in (select my_tenant_ids()));
create policy "certs_insert" on certificates
  for insert with check (tenant_id in (select my_tenant_ids()));
create policy "certs_update" on certificates
  for update using (tenant_id in (select my_tenant_ids()));

-- certificates: public read by public_id (for /c/[public_id] page — uses service role, but belt-and-suspenders)
-- The public page uses admin client so this isn't strictly needed, kept for completeness.

-- certificate_images: inherit access from parent certificate's tenant
create policy "certimg_select" on certificate_images
  for select using (
    certificate_id in (
      select id from certificates where tenant_id in (select my_tenant_ids())
    )
  );
create policy "certimg_insert" on certificate_images
  for insert with check (
    certificate_id in (
      select id from certificates where tenant_id in (select my_tenant_ids())
    )
  );

-- templates: tenant members can CRUD
create policy "tpl_select" on templates
  for select using (tenant_id in (select my_tenant_ids()));
create policy "tpl_insert" on templates
  for insert with check (tenant_id in (select my_tenant_ids()));
create policy "tpl_update" on templates
  for update using (tenant_id in (select my_tenant_ids()));
create policy "tpl_delete" on templates
  for delete using (tenant_id in (select my_tenant_ids()));

-- vehicle_histories: tenant members can read and insert
create policy "vh_select" on vehicle_histories
  for select using (tenant_id in (select my_tenant_ids()));
create policy "vh_insert" on vehicle_histories
  for insert with check (tenant_id in (select my_tenant_ids()));

-- nfc_tags: tenant members can CRUD
create policy "nfc_select" on nfc_tags
  for select using (tenant_id in (select my_tenant_ids()));
create policy "nfc_insert" on nfc_tags
  for insert with check (tenant_id in (select my_tenant_ids()));
create policy "nfc_update" on nfc_tags
  for update using (tenant_id in (select my_tenant_ids()));

-- insurer_access_logs: insert-only (audit logs are append-only)
-- Insurer reads are done via service role, so no select policy for anon/authenticated.
create policy "ial_insert" on insurer_access_logs
  for insert with check (true);

-- =============================================================
-- 11) updated_at triggers
-- =============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

create trigger trg_tm_updated_at
  before update on tenant_memberships
  for each row execute function set_updated_at();

create trigger trg_vehicles_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

create trigger trg_certificates_updated_at
  before update on certificates
  for each row execute function set_updated_at();

create trigger trg_templates_updated_at
  before update on templates
  for each row execute function set_updated_at();

create trigger trg_nfc_updated_at
  before update on nfc_tags
  for each row execute function set_updated_at();
