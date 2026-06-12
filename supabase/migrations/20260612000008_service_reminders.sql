-- =============================================================
-- 後日整備・交換部品提案管理 (Service Reminders) Migration
-- 車両の走行距離・前回施工日から交換推奨時期を算出し、アフター
-- フォロー提案を管理する。Broadleaf の「追加整備・交換部品提案
-- (従量課金): 走行距離・期間から交換提案時期を判断、後日整備登録」相当。
--
-- next_due_mileage / next_due_date は GENERATED ALWAYS STORED 列として
-- DB 側で算出する (app 層で再計算しないため整合が崩れない)。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。INSERT / UPDATE は WITH CHECK で必ず自
--      テナントへスコープ限定する。
-- =============================================================

create table if not exists service_reminders (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants (id) on delete cascade,
  customer_id                 uuid references customers (id) on delete cascade,
  vehicle_id                  uuid references vehicles (id) on delete cascade,
  service_name                text not null,
  reminder_type               text not null default 'mileage'
                                check (reminder_type in ('mileage', 'interval_months', 'both')),
  last_service_mileage        integer,
  recommended_interval_km     integer,
  last_service_date           date,
  recommended_interval_months integer,
  next_due_mileage integer generated always as (
    case when last_service_mileage is not null and recommended_interval_km is not null
    then last_service_mileage + recommended_interval_km
    else null end
  ) stored,
  next_due_date date generated always as (
    case when last_service_date is not null and recommended_interval_months is not null
    then (last_service_date + (recommended_interval_months || ' months')::interval)::date
    else null end
  ) stored,
  status                      text not null default 'active'
                                check (status in ('active', 'snoozed', 'completed', 'cancelled')),
  notified_at                 timestamptz,
  completed_at                timestamptz,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table service_reminders enable row level security;

-- テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists service_reminders_tenant_select on service_reminders;
create policy service_reminders_tenant_select on service_reminders
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists service_reminders_tenant_insert on service_reminders;
create policy service_reminders_tenant_insert on service_reminders
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists service_reminders_tenant_update on service_reminders;
create policy service_reminders_tenant_update on service_reminders
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists service_reminders_tenant_delete on service_reminders;
create policy service_reminders_tenant_delete on service_reminders
  for delete using (tenant_id in (select my_tenant_ids()));

-- service_reminders は同一マイグレーション内で CREATE TABLE 済み (空テーブル)
-- のため CONCURRENTLY 不要 (lint-migrations: create-index-without-concurrently)。
create index if not exists idx_service_reminders_tenant
  on service_reminders (tenant_id, status);
create index if not exists idx_service_reminders_due
  on service_reminders (next_due_date) where status = 'active';
create index if not exists idx_service_reminders_vehicle
  on service_reminders (vehicle_id) where vehicle_id is not null;
-- FK covering index: customer_id 経由の lookup / on delete cascade 用
create index if not exists idx_service_reminders_customer
  on service_reminders (customer_id) where customer_id is not null;

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_service_reminders_updated_at on service_reminders;
create trigger trg_service_reminders_updated_at
  before update on service_reminders
  for each row execute function set_updated_at();
