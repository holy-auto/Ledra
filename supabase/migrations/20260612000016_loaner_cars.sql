-- =============================================================
-- 代車管理 (Loaner Car Management) Migration
-- 店舗が保有する代車マスタ (loaner_cars) と、どの代車を・どの顧客に・
-- どの予約に紐付けて貸し出したか / 返却予定をいつにするかを記録する
-- 貸出記録 (loaner_car_loans) を管理する。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。SELECT は全メンバー、INSERT / UPDATE /
--      DELETE は WITH CHECK で必ず自テナントへスコープ限定する。
--      (アプリ層では staff 以上のみ書き込みを許可するが、RLS は
--       テナント境界の最終防壁として全 CRUD をテナントスコープに縛る。)
-- =============================================================

-- 代車マスタ
create table if not exists loaner_cars (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,          -- 管理名 e.g. "代車A"
  plate_display text,                   -- ナンバー
  maker         text,
  model         text,
  year          integer,
  color         text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 代車貸出記録
create table if not exists loaner_car_loans (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  loaner_car_id   uuid not null references loaner_cars(id) on delete cascade,
  reservation_id  uuid references reservations(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text,                 -- 顧客名スナップショット
  lent_at         timestamptz not null default now(),
  return_due_at   timestamptz,
  returned_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_lc_tenant on loaner_cars(tenant_id);
create index if not exists idx_lcl_tenant on loaner_car_loans(tenant_id);
create index if not exists idx_lcl_car on loaner_car_loans(loaner_car_id);
-- 貸出中 (未返却) の絞り込み用 部分インデックス
create index if not exists idx_lcl_active on loaner_car_loans(tenant_id, returned_at) where returned_at is null;
-- FK covering index: reservation_id / customer_id 経由の lookup / on delete 用
create index if not exists idx_lcl_reservation on loaner_car_loans(reservation_id) where reservation_id is not null;
create index if not exists idx_lcl_customer on loaner_car_loans(customer_id) where customer_id is not null;

-- =============================================================
-- RLS
-- =============================================================
alter table loaner_cars enable row level security;
alter table loaner_car_loans enable row level security;

-- loaner_cars: テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists loaner_cars_tenant_select on loaner_cars;
create policy loaner_cars_tenant_select on loaner_cars
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists loaner_cars_tenant_insert on loaner_cars;
create policy loaner_cars_tenant_insert on loaner_cars
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists loaner_cars_tenant_update on loaner_cars;
create policy loaner_cars_tenant_update on loaner_cars
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists loaner_cars_tenant_delete on loaner_cars;
create policy loaner_cars_tenant_delete on loaner_cars
  for delete using (tenant_id in (select my_tenant_ids()));

-- loaner_car_loans: テナント分離
drop policy if exists loaner_car_loans_tenant_select on loaner_car_loans;
create policy loaner_car_loans_tenant_select on loaner_car_loans
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists loaner_car_loans_tenant_insert on loaner_car_loans;
create policy loaner_car_loans_tenant_insert on loaner_car_loans
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists loaner_car_loans_tenant_update on loaner_car_loans;
create policy loaner_car_loans_tenant_update on loaner_car_loans
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists loaner_car_loans_tenant_delete on loaner_car_loans;
create policy loaner_car_loans_tenant_delete on loaner_car_loans
  for delete using (tenant_id in (select my_tenant_ids()));

-- =============================================================
-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
-- =============================================================
drop trigger if exists trg_loaner_cars_updated_at on loaner_cars;
create trigger trg_loaner_cars_updated_at
  before update on loaner_cars
  for each row execute function set_updated_at();

drop trigger if exists trg_loaner_car_loans_updated_at on loaner_car_loans;
create trigger trg_loaner_car_loans_updated_at
  before update on loaner_car_loans
  for each row execute function set_updated_at();
