-- =============================================================
-- 鈑金工程管理 (Body Repair Workflow Tracking) Migration
-- 鈑金/塗装の修理案件を工程ステージで管理する:
--   受付(intake) → 協定(estimate) → 鈑金(bodywork) → 塗装(paint)
--   → 完成(complete) → 出庫(delivered)
--
-- 各ステージへの遷移タイムスタンプを保持し、Kanban ボードで進捗を
-- 可視化する。協定情報 (見積金額・保険会社・受付番号) も併せて持つ。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。INSERT / UPDATE は WITH CHECK で必ず自
--      テナントへスコープ限定する。
-- =============================================================

create table if not exists body_repair_jobs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants (id) on delete cascade,
  reservation_id   uuid references reservations (id) on delete set null,
  customer_id      uuid references customers (id) on delete set null,
  vehicle_id       uuid references vehicles (id) on delete set null,
  -- 工程ステージ
  stage            text not null default 'intake'
                     check (stage in ('intake', 'estimate', 'bodywork', 'paint', 'complete', 'delivered')),
  -- 協定情報
  estimate_amount   numeric(12, 0),
  insurance_company text,
  claim_number      text,
  -- 担当 (auth.users id。cross-schema の複雑さを避けるため FK は張らない)
  assigned_staff_id uuid,
  -- 工程タイムスタンプ
  intake_at         timestamptz,
  estimate_at       timestamptz,
  bodywork_start_at timestamptz,
  paint_start_at    timestamptz,
  complete_at       timestamptz,
  delivered_at      timestamptz,
  -- メモ
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_brj_tenant on body_repair_jobs (tenant_id);
create index if not exists idx_brj_stage on body_repair_jobs (tenant_id, stage);
create index if not exists idx_brj_reservation on body_repair_jobs (reservation_id) where reservation_id is not null;
-- FK covering index: customer_id / vehicle_id 経由の lookup / on delete set null 用
create index if not exists idx_brj_customer on body_repair_jobs (customer_id) where customer_id is not null;
create index if not exists idx_brj_vehicle on body_repair_jobs (vehicle_id) where vehicle_id is not null;

alter table body_repair_jobs enable row level security;

-- テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists "tenant members can read body repair jobs" on body_repair_jobs;
create policy "tenant members can read body repair jobs"
  on body_repair_jobs for select
  using (tenant_id in (select my_tenant_ids()));

drop policy if exists "staff can insert body repair jobs" on body_repair_jobs;
create policy "staff can insert body repair jobs"
  on body_repair_jobs for insert
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists "staff can update body repair jobs" on body_repair_jobs;
create policy "staff can update body repair jobs"
  on body_repair_jobs for update
  using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists "staff can delete body repair jobs" on body_repair_jobs;
create policy "staff can delete body repair jobs"
  on body_repair_jobs for delete
  using (tenant_id in (select my_tenant_ids()));

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_body_repair_jobs_updated_at on body_repair_jobs;
create trigger set_body_repair_jobs_updated_at
  before update on body_repair_jobs
  for each row execute function set_updated_at();
