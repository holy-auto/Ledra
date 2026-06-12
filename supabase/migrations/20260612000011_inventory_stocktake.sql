-- =============================================================
-- 在庫棚卸 (Inventory Stocktaking) Migration
-- 定期棚卸: 実測在庫とシステム上の期待在庫を突合し差異を記録する。
--   - stocktake_sessions : 1 回の棚卸作業 (open / closed)
--   - stocktake_items    : 各品目 (menu_items) の実測数明細
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する (coupons / maintenance_packs 等と同方針)。
--      INSERT / UPDATE は WITH CHECK で必ず自テナントへスコープ限定する。
--      アプリ層では staff 以上のみ書込可、それ以外は読取のみ (RLS は
--      テナント境界のバックストップで、ロール制御は app 層で行う)。
-- =============================================================

-- =============================================================
-- 1) stocktake_sessions
-- =============================================================
create table if not exists stocktake_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  name        text not null,                      -- 例: "2026年6月棚卸"
  status      text not null default 'open'
                check (status in ('open', 'closed')),
  started_at  timestamptz not null default now(),
  closed_at   timestamptz,
  notes       text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table stocktake_sessions enable row level security;

drop policy if exists stocktake_sessions_tenant_select on stocktake_sessions;
create policy stocktake_sessions_tenant_select on stocktake_sessions
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists stocktake_sessions_tenant_insert on stocktake_sessions;
create policy stocktake_sessions_tenant_insert on stocktake_sessions
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists stocktake_sessions_tenant_update on stocktake_sessions;
create policy stocktake_sessions_tenant_update on stocktake_sessions
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists stocktake_sessions_tenant_delete on stocktake_sessions;
create policy stocktake_sessions_tenant_delete on stocktake_sessions
  for delete using (tenant_id in (select my_tenant_ids()));

-- stocktake_sessions は同一マイグレーション内で CREATE TABLE 済み (空テーブル)
-- のため CONCURRENTLY 不要 (lint-migrations: create-index-without-concurrently)。
create index if not exists idx_sts_tenant on stocktake_sessions (tenant_id);

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_stocktake_sessions_updated_at on stocktake_sessions;
create trigger trg_stocktake_sessions_updated_at
  before update on stocktake_sessions
  for each row execute function set_updated_at();

-- =============================================================
-- 2) stocktake_items
-- =============================================================
create table if not exists stocktake_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (id) on delete cascade,
  session_id        uuid not null references stocktake_sessions (id) on delete cascade,
  menu_item_id      uuid not null references menu_items (id) on delete cascade,
  expected_qty      numeric(10, 2) not null default 0,  -- システム上の在庫
  counted_qty       numeric(10, 2),                     -- 実測値 (null = 未カウント)
  unit              text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (session_id, menu_item_id)
);

alter table stocktake_items enable row level security;

drop policy if exists stocktake_items_tenant_select on stocktake_items;
create policy stocktake_items_tenant_select on stocktake_items
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists stocktake_items_tenant_insert on stocktake_items;
create policy stocktake_items_tenant_insert on stocktake_items
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists stocktake_items_tenant_update on stocktake_items;
create policy stocktake_items_tenant_update on stocktake_items
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists stocktake_items_tenant_delete on stocktake_items;
create policy stocktake_items_tenant_delete on stocktake_items
  for delete using (tenant_id in (select my_tenant_ids()));

create index if not exists idx_sti_session on stocktake_items (session_id);
create index if not exists idx_sti_tenant on stocktake_items (tenant_id);
-- FK covering index: menu_item_id 経由の lookup / on delete cascade 用
create index if not exists idx_sti_menu_item on stocktake_items (menu_item_id);

drop trigger if exists trg_stocktake_items_updated_at on stocktake_items;
create trigger trg_stocktake_items_updated_at
  before update on stocktake_items
  for each row execute function set_updated_at();
