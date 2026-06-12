-- =============================================================
-- contact_schedules: 架電・訪問・フォローアップのコンタクト予定管理
-- 顧客への架電/訪問/メール/SMS/LINE 連絡を予定・実績として記録する。
-- テナント境界は RLS (tenant_memberships) を一次防御とする。
-- =============================================================

create table if not exists contact_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  contact_type text not null default 'call'
    check (contact_type in ('call','visit','email','sms','line')),
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','completed','skipped','rescheduled')),
  result text check (result in ('success','no_answer','declined','rescheduled','converted')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================
-- Row-Level Security
-- 既存テナントテーブル (customers / menu_items 等) と同じ
-- `tenant_id IN (SELECT tenant_id FROM tenant_memberships ...)` パターンで
-- select/insert/update/delete を個別に許可する。
-- INSERT は WITH CHECK で必ず自テナントへスコープ限定する。
-- =============================================================
alter table contact_schedules enable row level security;

drop policy if exists contact_schedules_tenant_select on contact_schedules;
create policy contact_schedules_tenant_select on contact_schedules
  for select using (
    tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
  );

drop policy if exists contact_schedules_tenant_insert on contact_schedules;
create policy contact_schedules_tenant_insert on contact_schedules
  for insert with check (
    tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
  );

drop policy if exists contact_schedules_tenant_update on contact_schedules;
create policy contact_schedules_tenant_update on contact_schedules
  for update using (
    tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
  );

drop policy if exists contact_schedules_tenant_delete on contact_schedules;
create policy contact_schedules_tenant_delete on contact_schedules
  for delete using (
    tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
  );

-- =============================================================
-- Indexes
-- contact_schedules は同一マイグレーション内で CREATE TABLE 済み (空テーブル) の
-- ため CONCURRENTLY は不要 (lint-migrations: create-index-without-concurrently)。
-- =============================================================
create index if not exists idx_contact_schedules_tenant_status
  on contact_schedules(tenant_id, status, scheduled_at);
create index if not exists idx_contact_schedules_customer
  on contact_schedules(customer_id) where customer_id is not null;

-- updated_at 自動更新トリガ (set_updated_at は core_tables で定義済み)
drop trigger if exists trg_contact_schedules_updated_at on contact_schedules;
create trigger trg_contact_schedules_updated_at
  before update on contact_schedules
  for each row execute function set_updated_at();
