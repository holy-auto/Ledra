-- =============================================================
-- デジタル点検表 (Digital Inspection Checklist) Migration
-- 入庫 / 納車時に車両状態を構造化チェックリストで記録する。
--   - inspection_templates : テナントがカスタマイズ可能な点検テンプレート
--   - inspection_records    : 実施済みの点検記録 (テンプレ snapshot + 回答 + 写真)
--
-- RLS: コア各テーブルと同じく my_tenant_ids() security-definer ヘルパを
--      用いてテナント分離する (tenant_memberships の limit 1 サブクエリは
--      マルチテナント所属ユーザで誤テナントに固定されうるため使わない)。
-- =============================================================

-- =============================================================
-- 1) inspection_templates (点検テンプレート)
-- =============================================================
create table if not exists inspection_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,         -- e.g. "入庫時点検", "納車前点検"
  items       jsonb not null default '[]'::jsonb,
  -- items: [{ id: uuid, label: string, type: "ok_ng"|"text"|"numeric" }]
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================
-- 2) inspection_records (実施済み点検記録)
-- =============================================================
create table if not exists inspection_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  template_id     uuid references inspection_templates(id) on delete set null,
  reservation_id  uuid references reservations(id) on delete set null,
  vehicle_id      uuid references vehicles(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  inspection_type text not null default 'intake'
                    check (inspection_type in ('intake','delivery','periodic')),
  -- 回答: { [item_id]: { value: string|boolean, note?: string } }
  answers         jsonb not null default '{}'::jsonb,
  -- 外観写真 URL 配列 (Supabase Storage)
  photo_urls      jsonb not null default '[]'::jsonb,
  -- 履歴保全用: 点検実施時点のテンプレ名 / 項目 snapshot
  template_name   text,
  template_items  jsonb not null default '[]'::jsonb,
  inspector_name  text,
  inspected_at    timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_it_tenant on inspection_templates(tenant_id);
create index if not exists idx_ir_tenant on inspection_records(tenant_id);
create index if not exists idx_ir_reservation on inspection_records(reservation_id) where reservation_id is not null;
create index if not exists idx_ir_vehicle on inspection_records(vehicle_id) where vehicle_id is not null;
-- FK covering index: template_id / customer_id 経由の lookup / on delete set null 用
create index if not exists idx_ir_template on inspection_records(template_id) where template_id is not null;
create index if not exists idx_ir_customer on inspection_records(customer_id) where customer_id is not null;

-- =============================================================
-- 3) RLS — inspection_templates
-- =============================================================
alter table inspection_templates enable row level security;

drop policy if exists inspection_templates_tenant_select on inspection_templates;
create policy inspection_templates_tenant_select on inspection_templates
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists inspection_templates_tenant_insert on inspection_templates;
create policy inspection_templates_tenant_insert on inspection_templates
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists inspection_templates_tenant_update on inspection_templates;
create policy inspection_templates_tenant_update on inspection_templates
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists inspection_templates_tenant_delete on inspection_templates;
create policy inspection_templates_tenant_delete on inspection_templates
  for delete using (tenant_id in (select my_tenant_ids()));

-- =============================================================
-- 4) RLS — inspection_records
-- =============================================================
alter table inspection_records enable row level security;

drop policy if exists inspection_records_tenant_select on inspection_records;
create policy inspection_records_tenant_select on inspection_records
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists inspection_records_tenant_insert on inspection_records;
create policy inspection_records_tenant_insert on inspection_records
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists inspection_records_tenant_update on inspection_records;
create policy inspection_records_tenant_update on inspection_records
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists inspection_records_tenant_delete on inspection_records;
create policy inspection_records_tenant_delete on inspection_records
  for delete using (tenant_id in (select my_tenant_ids()));

-- =============================================================
-- 5) updated_at トリガー (core_tables の set_updated_at() を再利用)
-- =============================================================
drop trigger if exists trg_inspection_templates_updated_at on inspection_templates;
create trigger trg_inspection_templates_updated_at
  before update on inspection_templates
  for each row execute function set_updated_at();

drop trigger if exists trg_inspection_records_updated_at on inspection_records;
create trigger trg_inspection_records_updated_at
  before update on inspection_records
  for each row execute function set_updated_at();
