-- =============================================================
-- 損保協定・アジャスター連携 (Insurance Claim Coordination) Migration
--
-- 鈑金修理案件(body_repair_jobs)の損保協定をトラッキングする。
-- アジャスター訪問、協定金額、請求ステータスを記録する。
-- body_repair_jobs が既に持つ insurance_company / claim_number /
-- estimate_amount を「協定状況の時系列管理」として拡張する別テーブル。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。
--      - SELECT: テナントメンバーは閲覧可
--      - INSERT/UPDATE/DELETE: スタッフ以上 (テナント分離のみで担保し、
--        RBAC は API 層 requireMinRole で実施)
-- =============================================================

create table if not exists insurance_claims (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants (id) on delete cascade,
  body_repair_job_id  uuid references body_repair_jobs (id) on delete set null,
  reservation_id      uuid references reservations (id) on delete set null,
  -- 保険情報
  insurance_company   text not null,
  claim_number        text,
  adjuster_name       text,
  adjuster_phone      text,
  -- 協定状況
  status              text not null default 'pending'
                        check (status in ('pending', 'adjuster_scheduled', 'adjuster_visited', 'agreed', 'rejected', 'paid')),
  -- アジャスター訪問
  adjuster_visit_date date,
  -- 協定金額
  agreed_amount       numeric(12, 0),
  deductible_amount   numeric(12, 0),    -- 免責金額
  customer_burden     numeric(12, 0),    -- 顧客負担額 (= agreed - deductible)
  -- タイムライン
  submitted_at        date,
  agreed_at           date,
  paid_at             date,
  -- メモ
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_ic_tenant on insurance_claims (tenant_id);
create index if not exists idx_ic_job on insurance_claims (body_repair_job_id) where body_repair_job_id is not null;
create index if not exists idx_ic_status on insurance_claims (tenant_id, status);
-- FK covering index: reservation_id 経由の lookup / on delete set null 用
create index if not exists idx_ic_reservation on insurance_claims (reservation_id) where reservation_id is not null;

alter table insurance_claims enable row level security;

-- テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists "insurance_claims_select" on insurance_claims;
create policy "insurance_claims_select" on insurance_claims
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists "insurance_claims_insert" on insurance_claims;
create policy "insurance_claims_insert" on insurance_claims
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists "insurance_claims_update" on insurance_claims;
create policy "insurance_claims_update" on insurance_claims
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists "insurance_claims_delete" on insurance_claims;
create policy "insurance_claims_delete" on insurance_claims
  for delete using (tenant_id in (select my_tenant_ids()));

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_insurance_claims_updated_at on insurance_claims;
create trigger set_insurance_claims_updated_at
  before update on insurance_claims
  for each row execute function set_updated_at();
