-- =============================================================
-- タイヤ保管管理 (Tire Storage Management) Migration
-- 店舗で預かっている顧客のタイヤを管理する。各保管記録は顧客・車両に
-- 紐付き、季節交換時期 (swap_month) をリマインドに利用する。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。SELECT は全メンバー、INSERT / UPDATE /
--      DELETE は WITH CHECK で必ず自テナントへスコープ限定する。
-- =============================================================

create table if not exists tire_storages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  customer_id     uuid references customers(id) on delete set null,
  vehicle_id      uuid references vehicles(id) on delete set null,
  customer_name   text,               -- スナップショット
  vehicle_info    text,               -- e.g. "トヨタ プリウス 品川123あ4567"
  -- タイヤ情報
  tire_type       text not null default 'winter'
                    check (tire_type in ('summer','winter','all_season')),
  tire_size       text,               -- e.g. "195/65R15"
  brand           text,
  quantity        integer not null default 4 check (quantity between 1 and 8),
  -- 保管場所
  storage_location text,             -- e.g. "棚A-3"
  -- 状態
  status          text not null default 'stored'
                    check (status in ('stored','returned','disposed')),
  stored_at       date not null default current_date,
  returned_at     date,
  -- 次回交換推奨月 (1–12)
  swap_month      integer check (swap_month between 1 and 12),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ts_tenant on tire_storages(tenant_id);
create index if not exists idx_ts_customer on tire_storages(customer_id) where customer_id is not null;
create index if not exists idx_ts_status on tire_storages(tenant_id, status);
-- FK covering index: vehicle_id 経由の lookup / on delete 用
create index if not exists idx_ts_vehicle on tire_storages(vehicle_id) where vehicle_id is not null;
-- 交換時期リマインド用: 保管中のものを swap_month で絞り込む
create index if not exists idx_ts_swap_month on tire_storages(tenant_id, swap_month) where status = 'stored';

-- =============================================================
-- RLS
-- =============================================================
alter table tire_storages enable row level security;

drop policy if exists tire_storages_tenant_select on tire_storages;
create policy tire_storages_tenant_select on tire_storages
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists tire_storages_tenant_insert on tire_storages;
create policy tire_storages_tenant_insert on tire_storages
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists tire_storages_tenant_update on tire_storages;
create policy tire_storages_tenant_update on tire_storages
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists tire_storages_tenant_delete on tire_storages;
create policy tire_storages_tenant_delete on tire_storages
  for delete using (tenant_id in (select my_tenant_ids()));

-- =============================================================
-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
-- =============================================================
drop trigger if exists trg_tire_storages_updated_at on tire_storages;
create trigger trg_tire_storages_updated_at
  before update on tire_storages
  for each row execute function set_updated_at();
