-- =============================================================
-- 入金入力・売掛元帳 (Payment Entry + Accounts Receivable Ledger) Migration
-- 帳票 (documents) に対する入金を記録し、売掛残高を算出する。
--   - payment_entries : 1 件の入金レコード (金額 / 入金方法 / 入金日)
--
-- 売掛残高 = documents.total - Σ(payment_entries.amount)
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する (coupons / maintenance_packs 等と同方針)。
--      INSERT / UPDATE は WITH CHECK で必ず自テナントへスコープ限定する。
--      アプリ層では staff 以上のみ書込可、それ以外は読取のみ。
-- =============================================================

-- =============================================================
-- 1) payment_entries
-- =============================================================
create table if not exists payment_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  document_id     uuid not null references documents (id) on delete cascade,
  customer_id     uuid references customers (id) on delete set null,
  -- 入金情報
  amount          numeric(12, 0) not null check (amount > 0),
  payment_method  text not null default 'cash'
                    check (payment_method in ('cash', 'bank_transfer', 'credit_card', 'qr', 'other')),
  payment_date    date not null default current_date,
  reference_no    text,                            -- 振込番号等
  notes           text,
  -- 担当
  recorded_by     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table payment_entries enable row level security;

drop policy if exists payment_entries_tenant_select on payment_entries;
create policy payment_entries_tenant_select on payment_entries
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists payment_entries_tenant_insert on payment_entries;
create policy payment_entries_tenant_insert on payment_entries
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists payment_entries_tenant_update on payment_entries;
create policy payment_entries_tenant_update on payment_entries
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists payment_entries_tenant_delete on payment_entries;
create policy payment_entries_tenant_delete on payment_entries
  for delete using (tenant_id in (select my_tenant_ids()));

-- payment_entries は同一マイグレーション内で CREATE TABLE 済み (空テーブル)
-- のため CONCURRENTLY 不要 (lint-migrations: create-index-without-concurrently)。
create index if not exists idx_pe_tenant on payment_entries (tenant_id);
-- FK covering index: document_id 経由の lookup / 入金合計集計用
create index if not exists idx_pe_document on payment_entries (document_id);
create index if not exists idx_pe_customer on payment_entries (customer_id) where customer_id is not null;
create index if not exists idx_pe_date on payment_entries (tenant_id, payment_date);

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_payment_entries_updated_at on payment_entries;
create trigger trg_payment_entries_updated_at
  before update on payment_entries
  for each row execute function set_updated_at();
