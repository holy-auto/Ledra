-- =============================================================
-- 部品発注管理 (Parts Ordering Management) Migration
-- 案件 (予約) ごとに発注した部品を追跡する。
--   - 入荷待ちの可視化、部品待ちで止まっている案件の把握に利用する。
--
-- RLS: コア各テーブルと同じく my_tenant_ids() security-definer ヘルパを
--      用いてテナント分離する (tenant_memberships の limit 1 サブクエリは
--      マルチテナント所属ユーザで誤テナントに固定されうるため使わない)。
-- =============================================================

create table if not exists parts_orders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  reservation_id  uuid references reservations(id) on delete set null,
  -- 部品情報
  part_name       text not null,
  part_number     text,
  supplier        text,              -- 仕入先名
  quantity        integer not null default 1 check (quantity > 0),
  unit_price      numeric(10,0),
  -- 発注状態
  status          text not null default 'ordered'
                    check (status in ('ordered','partial','received','cancelled')),
  ordered_at      date not null default current_date,
  expected_at     date,              -- 入荷予定日
  received_at     date,
  -- メモ
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_po_tenant on parts_orders(tenant_id);
create index if not exists idx_po_reservation on parts_orders(reservation_id) where reservation_id is not null;
create index if not exists idx_po_status on parts_orders(tenant_id, status);
create index if not exists idx_po_expected on parts_orders(tenant_id, expected_at) where expected_at is not null;

-- =============================================================
-- RLS
-- =============================================================
alter table parts_orders enable row level security;

drop policy if exists parts_orders_tenant_select on parts_orders;
create policy parts_orders_tenant_select on parts_orders
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists parts_orders_tenant_insert on parts_orders;
create policy parts_orders_tenant_insert on parts_orders
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists parts_orders_tenant_update on parts_orders;
create policy parts_orders_tenant_update on parts_orders
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists parts_orders_tenant_delete on parts_orders;
create policy parts_orders_tenant_delete on parts_orders
  for delete using (tenant_id in (select my_tenant_ids()));

-- =============================================================
-- updated_at トリガー (core_tables の set_updated_at() を再利用)
-- =============================================================
drop trigger if exists trg_parts_orders_updated_at on parts_orders;
create trigger trg_parts_orders_updated_at
  before update on parts_orders
  for each row execute function set_updated_at();
