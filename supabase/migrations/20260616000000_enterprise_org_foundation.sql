-- =============================================================================
-- Enterprise Multi-store Foundation
--
-- エンタープライズ契約 (本社 + 複数の支店 / FC 店舗) に備えた基盤。
--
-- 前提となる既存資産:
--   organizations        … 組織本体 (本社)。owner_id = 統括ユーザ。
--   organization_members … 組織に所属するテナント (= 各店舗アカウント) の連結。
--   tenants / customers / vehicles / vehicle_histories / certificates / reservations
--                        … 各店舗のデータ。tenant_id でスコープ + RLS。
--
-- 本マイグレーションが追加するもの:
--   1) organization_users  … 本社側の「チーム」(複数ユーザ + 役割)。
--                            これまで organizations.owner_id の単一ユーザしか
--                            本社を扱えなかったのを、複数人 + 役割に拡張する。
--   2) my_org_ids() / my_org_tenant_ids() … 本社ユーザが所属組織配下の全店舗を
--                            横断参照するための RLS ヘルパー。
--   3) 横断 READ ポリシー  … customers / vehicles / vehicle_histories /
--                            certificates / reservations に対し、本社ユーザは
--                            組織配下の全店舗を「閲覧のみ」可能にする。
--                            書込 (INSERT/UPDATE/DELETE) は従来通り tenant 単位
--                            の membership が必要 = 本社以外は他店を変更できない。
--   4) 基幹ソフト連携の取込基盤 … customers / vehicles / vehicle_histories に
--                            source_system / external_ref / last_synced_at を追加し、
--                            (tenant_id, source_system, external_ref) で冪等 upsert。
--                            取込実行ログ integration_sync_runs を追加。
--
-- 設計メモ:
--   - 役割ヘルパーは security definer + search_path='' で RLS 再帰を回避。
--   - 複合ユニークは「部分索引」ではなく通常索引。Postgres は UNIQUE 内の
--     NULL を distinct 扱いするため、手動作成レコード (external_ref IS NULL)
--     は重複制約に掛からず、取込レコード (両方 NOT NULL) のみ一意化される。
--     ON CONFLICT の推論も部分索引より素直に効く。
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) organization_users : 本社チーム (複数ユーザ + 役割)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists organization_users (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- org_owner : 本社オーナー相当 (組織・メンバー・本社チームを管理)
  -- org_admin : 本社管理者 (全店舗を横断閲覧 + 組織設定の一部)
  -- org_viewer: 本社閲覧者 (全店舗を横断閲覧のみ)
  role            text not null default 'org_viewer'
                    check (role in ('org_owner', 'org_admin', 'org_viewer')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_org_users_org  on organization_users (organization_id);
create index if not exists idx_org_users_user on organization_users (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS ヘルパー : 本社ユーザの所属組織 / 配下テナント
-- ─────────────────────────────────────────────────────────────────────────────

-- 現在のユーザが「本社側」として束ねる組織 ID 群。
--   - organizations.owner_id = 自分 (既存の単一オーナー方式と後方互換)
--   - organization_users に自分が居る組織 (新しいチーム方式)
create or replace function my_org_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.organizations where owner_id = auth.uid()
  union
  select organization_id from public.organization_users where user_id = auth.uid();
$$;

-- 上記組織に紐づく全テナント (= 全店舗) ID 群。横断 READ の対象。
create or replace function my_org_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct om.tenant_id
  from public.organization_members om
  where om.organization_id in (select public.my_org_ids());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS : organization_users
-- ─────────────────────────────────────────────────────────────────────────────
alter table organization_users enable row level security;

-- 本人の所属行、もしくは組織オーナーは閲覧可能。
drop policy if exists "org_users_select" on organization_users;
create policy "org_users_select" on organization_users
  for select using (
    user_id = auth.uid()
    or organization_id in (select id from organizations where owner_id = auth.uid())
  );

-- 本社チームの追加・更新・削除は組織オーナーのみ。
drop policy if exists "org_users_insert" on organization_users;
create policy "org_users_insert" on organization_users
  for insert with check (
    organization_id in (select id from organizations where owner_id = auth.uid())
  );

drop policy if exists "org_users_update" on organization_users;
create policy "org_users_update" on organization_users
  for update using (
    organization_id in (select id from organizations where owner_id = auth.uid())
  )
  with check (
    organization_id in (select id from organizations where owner_id = auth.uid())
  );

drop policy if exists "org_users_delete" on organization_users;
create policy "org_users_delete" on organization_users
  for delete using (
    organization_id in (select id from organizations where owner_id = auth.uid())
  );

drop trigger if exists set_organization_users_updated_at on organization_users;
create trigger set_organization_users_updated_at
  before update on organization_users
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) 既存 organizations / organization_members を本社チームにも開放
--    (これまで owner_id 単一ユーザのみだった read を org_users にも広げる)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "org_team_can_read_organization" on organizations;
create policy "org_team_can_read_organization" on organizations
  for select using (
    id in (select organization_id from organization_users where user_id = auth.uid())
  );

drop policy if exists "org_team_can_read_members" on organization_members;
create policy "org_team_can_read_members" on organization_members
  for select using (
    organization_id in (select organization_id from organization_users where user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) 横断 READ ポリシー (本社ユーザ → 組織配下全店舗の閲覧のみ)
--    INSERT/UPDATE/DELETE は付与しない = 本社以外は他店を変更できない、かつ
--    本社も「閲覧は横断・書込は店舗単位」の方針を満たす。
--    permissive policy は OR 合成されるため既存の tenant 単位ポリシーと共存する。
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "customers_org_select" on customers;
create policy "customers_org_select" on customers
  for select using (tenant_id in (select my_org_tenant_ids()));

drop policy if exists "vehicles_org_select" on vehicles;
create policy "vehicles_org_select" on vehicles
  for select using (tenant_id in (select my_org_tenant_ids()));

drop policy if exists "vh_org_select" on vehicle_histories;
create policy "vh_org_select" on vehicle_histories
  for select using (tenant_id in (select my_org_tenant_ids()));

drop policy if exists "certs_org_select" on certificates;
create policy "certs_org_select" on certificates
  for select using (tenant_id in (select my_org_tenant_ids()));

-- reservations は別マイグレーションで作成されるため存在確認のうえ付与。
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'reservations' and table_type = 'BASE TABLE'
  ) then
    execute 'drop policy if exists "reservations_org_select" on reservations';
    execute 'create policy "reservations_org_select" on reservations
               for select using (tenant_id in (select my_org_tenant_ids()))';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) 基幹ソフト連携の取込基盤 (Push 取込)
--    各店舗が利用する基幹ソフトの ID を external_ref に保持し、
--    (tenant_id, source_system, external_ref) で冪等に upsert できるようにする。
-- ─────────────────────────────────────────────────────────────────────────────

-- カラム追加のみ (nullable text — 既存行への影響なし)。冪等 upsert 用の
-- 複合ユニーク索引は既存テーブルをロックしないよう CONCURRENTLY で別ファイル
-- (companion migration 20260616000001) に分離する。

-- customers
alter table customers add column if not exists source_system  text;
alter table customers add column if not exists external_ref    text;
alter table customers add column if not exists last_synced_at  timestamptz;

-- vehicles
alter table vehicles add column if not exists source_system  text;
alter table vehicles add column if not exists external_ref    text;
alter table vehicles add column if not exists last_synced_at  timestamptz;

-- vehicle_histories (= 過去の作業履歴)
alter table vehicle_histories add column if not exists source_system  text;
alter table vehicle_histories add column if not exists external_ref    text;
alter table vehicle_histories add column if not exists last_synced_at  timestamptz;

-- vehicle_histories は core では INSERT/SELECT のみ。取込での再同期 (上書き) を
-- 可能にするため tenant メンバーの UPDATE ポリシーを追加 (取込は service role で
-- 行うが、UI からの修正も将来許容できるよう belt-and-suspenders)。
drop policy if exists "vh_update" on vehicle_histories;
create policy "vh_update" on vehicle_histories
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) integration_sync_runs : 取込実行ログ (監査 / 可観測性)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists integration_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  /** 連携元の基幹ソフト識別子 (例: 'broadleaf', 'tsuhan', 'custom-erp') */
  source_system text not null,
  /** 取込対象リソース */
  resource      text not null check (resource in ('customers', 'vehicles', 'work_history')),
  /** どの API キー経由か (失効後も追跡できるよう ON DELETE SET NULL) */
  api_key_id    uuid references tenant_api_keys (id) on delete set null,
  total         integer not null default 0,
  inserted      integer not null default 0,
  updated       integer not null default 0,
  failed        integer not null default 0,
  status        text not null default 'completed'
                  check (status in ('completed', 'partial', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sync_runs_tenant
  on integration_sync_runs (tenant_id, created_at desc);

alter table integration_sync_runs enable row level security;

-- 店舗メンバーは自店の取込ログを閲覧、本社ユーザは配下全店舗を横断閲覧。
drop policy if exists "sync_runs_select" on integration_sync_runs;
create policy "sync_runs_select" on integration_sync_runs
  for select using (
    tenant_id in (select my_tenant_ids())
    or tenant_id in (select my_org_tenant_ids())
  );
-- 書込は取込 API (service role) のみ。authenticated 向け INSERT ポリシーは付与しない。
