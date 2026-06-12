-- =============================================================
-- 組織管理強化 (Multi-store Group / Organization Management) Migration
--
-- グループオーナーが複数のテナント (店舗) アカウントを束ねる「組織」を
-- 作成し、横断ダッシュボードで全店舗を俯瞰できるようにする。
--
--   organizations         … 組織本体。owner_id = auth.users.id (グループ統括者)。
--   organization_members  … 組織に所属するテナント (店舗) の連結表。
--
-- RLS 方針:
--   organizations
--     - SELECT/UPDATE/DELETE: owner_id = auth.uid() (自分が作成した組織のみ)
--     - INSERT: 任意の認証ユーザ (owner_id は必ず自分にスコープさせる)
--   organization_members
--     - SELECT: 当該テナントのメンバー (my_tenant_ids() に含まれる) もしくは
--               親組織のオーナー
--     - INSERT/DELETE: 親組織のオーナーのみ
--
-- 注意: owner_id / tenant_id は auth スキーマや tenants を跨ぐが、
--       cross-schema FK の複雑さを避けるため owner_id には FK を張らない
--       (body_repair_jobs.assigned_staff_id と同じ方針)。tenant_id は
--       tenants(id) への FK + ON DELETE CASCADE を張る。
-- =============================================================

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null, -- auth.users.id (グループ統括ユーザ)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  tenant_id       uuid not null references tenants (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'member')),
  joined_at       timestamptz not null default now(),
  unique (organization_id, tenant_id)
);

create index if not exists idx_org_owner on organizations (owner_id);
create index if not exists idx_orgm_org on organization_members (organization_id);
create index if not exists idx_orgm_tenant on organization_members (tenant_id);

-- =============================================================
-- RLS: organizations
-- =============================================================
alter table organizations enable row level security;

-- 自分が作成した組織のみ参照
drop policy if exists "owner can read own organizations" on organizations;
create policy "owner can read own organizations"
  on organizations for select
  using (owner_id = auth.uid());

-- 認証ユーザは組織を作成できる (owner_id は必ず自分)
drop policy if exists "user can create organizations" on organizations;
create policy "user can create organizations"
  on organizations for insert
  with check (owner_id = auth.uid());

-- 自分が作成した組織のみ更新
drop policy if exists "owner can update own organizations" on organizations;
create policy "owner can update own organizations"
  on organizations for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 自分が作成した組織のみ削除
drop policy if exists "owner can delete own organizations" on organizations;
create policy "owner can delete own organizations"
  on organizations for delete
  using (owner_id = auth.uid());

-- =============================================================
-- RLS: organization_members
-- =============================================================
alter table organization_members enable row level security;

-- 当該テナントのメンバー、もしくは親組織のオーナーが参照可能
drop policy if exists "members can read organization members" on organization_members;
create policy "members can read organization members"
  on organization_members for select
  using (
    tenant_id in (select my_tenant_ids())
    or organization_id in (select id from organizations where owner_id = auth.uid())
  );

-- 親組織のオーナーのみメンバー追加
drop policy if exists "owner can add organization members" on organization_members;
create policy "owner can add organization members"
  on organization_members for insert
  with check (
    organization_id in (select id from organizations where owner_id = auth.uid())
  );

-- 親組織のオーナーのみメンバー削除
drop policy if exists "owner can remove organization members" on organization_members;
create policy "owner can remove organization members"
  on organization_members for delete
  using (
    organization_id in (select id from organizations where owner_id = auth.uid())
  );

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_organizations_updated_at on organizations;
create trigger set_organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();
