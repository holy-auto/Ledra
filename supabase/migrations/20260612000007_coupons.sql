-- =============================================================
-- 電子クーポン管理 (Digital Coupons) Migration
-- 顧客リテンション向けのデジタルクーポン発行・配信・利用管理。
--   - coupons        : クーポン定義 (割引内容 / 有効期間 / 利用上限)
--   - coupon_issues  : 顧客への発行レコード (発行 / 利用 / 失効 / 取消)
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。tenant_memberships の `limit 1` サブクエリは
--      マルチテナント所属ユーザで誤テナントに固定されうるため使わない
--      (maintenance_packs / sales_targets 等と同方針)。
--      INSERT / UPDATE は WITH CHECK で必ず自テナントへスコープ限定する。
-- =============================================================

-- =============================================================
-- 1) coupons
-- =============================================================
create table if not exists coupons (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  code           text not null,
  name           text not null,
  description    text,
  discount_type  text not null default 'fixed'
                   check (discount_type in ('fixed', 'percent')),
  discount_value integer not null check (discount_value > 0),
  -- fixed: JPY 金額 / percent: 1-100 の整数 (上限は app 層 zod でも検証)
  min_purchase   integer default 0,
  max_uses       integer,
  used_count     integer not null default 0,
  valid_from     date,
  valid_until    date,
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, code)
);

alter table coupons enable row level security;

-- テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists coupons_tenant_select on coupons;
create policy coupons_tenant_select on coupons
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists coupons_tenant_insert on coupons;
create policy coupons_tenant_insert on coupons
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists coupons_tenant_update on coupons;
create policy coupons_tenant_update on coupons
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists coupons_tenant_delete on coupons;
create policy coupons_tenant_delete on coupons
  for delete using (tenant_id in (select my_tenant_ids()));

-- coupons は同一マイグレーション内で CREATE TABLE 済み (空テーブル) のため
-- CONCURRENTLY 不要 (lint-migrations: create-index-without-concurrently)。
create index if not exists idx_coupons_tenant
  on coupons (tenant_id, is_active);

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_coupons_updated_at on coupons;
create trigger trg_coupons_updated_at
  before update on coupons
  for each row execute function set_updated_at();

-- =============================================================
-- 2) coupon_issues
-- =============================================================
create table if not exists coupon_issues (
  id               uuid primary key default gen_random_uuid(),
  coupon_id        uuid not null references coupons (id) on delete cascade,
  tenant_id        uuid not null references tenants (id) on delete cascade,
  customer_id      uuid references customers (id) on delete set null,
  issued_at        timestamptz not null default now(),
  expires_at       timestamptz,
  status           text not null default 'issued'
                     check (status in ('issued', 'used', 'expired', 'revoked')),
  used_at          timestamptz,
  document_id      uuid references documents (id) on delete set null,
  discount_applied integer,
  issue_channel    text default 'manual'
                     check (issue_channel in ('manual', 'line', 'sms', 'email'))
);

alter table coupon_issues enable row level security;

drop policy if exists coupon_issues_tenant_select on coupon_issues;
create policy coupon_issues_tenant_select on coupon_issues
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists coupon_issues_tenant_insert on coupon_issues;
create policy coupon_issues_tenant_insert on coupon_issues
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists coupon_issues_tenant_update on coupon_issues;
create policy coupon_issues_tenant_update on coupon_issues
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists coupon_issues_tenant_delete on coupon_issues;
create policy coupon_issues_tenant_delete on coupon_issues
  for delete using (tenant_id in (select my_tenant_ids()));

create index if not exists idx_coupon_issues_tenant
  on coupon_issues (tenant_id, status, issued_at desc);
-- FK covering index: coupon_id 経由の lookup / 発行件数集計用
create index if not exists idx_coupon_issues_coupon
  on coupon_issues (coupon_id);
create index if not exists idx_coupon_issues_customer
  on coupon_issues (customer_id) where customer_id is not null;
-- FK covering index: document_id 経由の lookup / on delete set null 用
create index if not exists idx_coupon_issues_document
  on coupon_issues (document_id) where document_id is not null;
