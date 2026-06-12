-- =============================================================
-- 請求按分 (Billing Splits) Migration
-- 1 件の帳票 (documents) を保険・自費・その他へ按分して記録する。
--   板金などで「保険負担分」と「顧客負担分」が混在する案件を扱うため。
--
-- 按分合計と documents.total の整合チェックはアプリ層 / UI で行う
-- (DB では金額・比率の値域のみを check する)。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する (payment_entries / coupons 等と同方針)。
--      INSERT / UPDATE は WITH CHECK で必ず自テナントへスコープ限定する。
--      アプリ層では staff 以上のみ書込可、それ以外は読取のみ。
-- =============================================================

-- =============================================================
-- 1) billing_splits
-- =============================================================
create table if not exists billing_splits (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  document_id     uuid not null references documents (id) on delete cascade,
  -- 按分先の種別
  split_type      text not null check (split_type in ('insurance', 'self_pay', 'other')),
  payer_name      text,                            -- 保険会社名 or 顧客名 (自由入力)
  claim_number    text,                            -- 保険請求番号
  split_amount    numeric(12, 0) not null check (split_amount >= 0),
  split_ratio     numeric(5, 2),                   -- % (任意、表示用)
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table billing_splits enable row level security;

drop policy if exists billing_splits_tenant_select on billing_splits;
create policy billing_splits_tenant_select on billing_splits
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists billing_splits_tenant_insert on billing_splits;
create policy billing_splits_tenant_insert on billing_splits
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists billing_splits_tenant_update on billing_splits;
create policy billing_splits_tenant_update on billing_splits
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists billing_splits_tenant_delete on billing_splits;
create policy billing_splits_tenant_delete on billing_splits
  for delete using (tenant_id in (select my_tenant_ids()));

-- billing_splits は同一マイグレーション内で CREATE TABLE 済み (空テーブル)
-- のため CONCURRENTLY 不要 (lint-migrations: create-index-without-concurrently)。
create index if not exists idx_bs_tenant on billing_splits (tenant_id);
-- FK covering index: document_id 経由の lookup / 按分合計集計用
create index if not exists idx_bs_document on billing_splits (document_id);

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_billing_splits_updated_at on billing_splits;
create trigger trg_billing_splits_updated_at
  before update on billing_splits
  for each row execute function set_updated_at();
