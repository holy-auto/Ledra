-- =============================================================
-- Maintenance Packs (メンテナンスパック管理) Migration
-- チケット制の「3年保証メンテパック」等を販売・管理する。
--   - maintenance_packs       : 販売したパック本体（チケット総数 / 消費数）
--   - maintenance_pack_usages : チケット 1 枚消費ごとの利用履歴
--
-- RLS: コア各テーブルと同じく my_tenant_ids() security-definer ヘルパを
--      用いてテナント分離する（tenant_memberships の limit 1 サブクエリは
--      マルチテナント所属ユーザで誤テナントに固定されうるため使わない）。
-- =============================================================

-- =============================================================
-- 1) maintenance_packs
-- =============================================================
create table if not exists maintenance_packs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  customer_id   uuid references customers (id) on delete set null,
  vehicle_id    uuid references vehicles (id) on delete set null,
  name          text not null,
  description   text,
  total_tickets integer not null default 1 check (total_tickets >= 1),
  used_tickets  integer not null default 0 check (used_tickets >= 0),
  price         integer,
  valid_from    date,
  valid_until   date,
  status        text not null default 'active'
                  check (status in ('active', 'expired', 'exhausted', 'cancelled')),
  sold_at       timestamptz default now(),
  document_id   uuid references documents (id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint used_le_total check (used_tickets <= total_tickets)
);

alter table maintenance_packs enable row level security;

-- テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists maintenance_packs_tenant_select on maintenance_packs;
create policy maintenance_packs_tenant_select on maintenance_packs
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists maintenance_packs_tenant_insert on maintenance_packs;
create policy maintenance_packs_tenant_insert on maintenance_packs
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists maintenance_packs_tenant_update on maintenance_packs;
create policy maintenance_packs_tenant_update on maintenance_packs
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists maintenance_packs_tenant_delete on maintenance_packs;
create policy maintenance_packs_tenant_delete on maintenance_packs
  for delete using (tenant_id in (select my_tenant_ids()));

create index if not exists idx_maintenance_packs_tenant
  on maintenance_packs (tenant_id, status);
create index if not exists idx_maintenance_packs_customer
  on maintenance_packs (customer_id) where customer_id is not null;
create index if not exists idx_maintenance_packs_vehicle
  on maintenance_packs (vehicle_id) where vehicle_id is not null;
-- FK covering index: document_id 経由の lookup / on delete set null 用
create index if not exists idx_maintenance_packs_document
  on maintenance_packs (document_id) where document_id is not null;

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_maintenance_packs_updated_at on maintenance_packs;
create trigger trg_maintenance_packs_updated_at
  before update on maintenance_packs
  for each row execute function set_updated_at();

-- =============================================================
-- 2) maintenance_pack_usages
-- =============================================================
create table if not exists maintenance_pack_usages (
  id             uuid primary key default gen_random_uuid(),
  pack_id        uuid not null references maintenance_packs (id) on delete cascade,
  reservation_id uuid references reservations (id) on delete set null,
  tenant_id      uuid not null references tenants (id) on delete cascade,
  notes          text,
  used_at        timestamptz not null default now()
);

alter table maintenance_pack_usages enable row level security;

drop policy if exists maintenance_pack_usages_tenant_select on maintenance_pack_usages;
create policy maintenance_pack_usages_tenant_select on maintenance_pack_usages
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists maintenance_pack_usages_tenant_insert on maintenance_pack_usages;
create policy maintenance_pack_usages_tenant_insert on maintenance_pack_usages
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists maintenance_pack_usages_tenant_delete on maintenance_pack_usages;
create policy maintenance_pack_usages_tenant_delete on maintenance_pack_usages
  for delete using (tenant_id in (select my_tenant_ids()));

create index if not exists idx_maintenance_pack_usages_pack
  on maintenance_pack_usages (pack_id);
-- FK covering index: reservation_id / tenant 経由の lookup 用
create index if not exists idx_maintenance_pack_usages_reservation
  on maintenance_pack_usages (reservation_id) where reservation_id is not null;
create index if not exists idx_maintenance_pack_usages_tenant
  on maintenance_pack_usages (tenant_id);
