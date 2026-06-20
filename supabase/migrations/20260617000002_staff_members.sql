-- スタッフ管理: 職人レジストリ（社内 + 外注）+ スキルタグ + シフト + 案件アサイン
--
-- 背景:
--   予約の担当者は `reservations.assigned_user_id`（auth.users）で表現していたが、
--   これは「ログインアカウントを持つ社内メンバー」しか割り当てられない。
--   コーティング店では **外注職人（フリーランス）** に施工を任せることが多く、
--   ログインを持たない作業者もアサイン・実績集計したい。さらに
--   「PPF認定 / コーティング / 磨き」等のスキルタグやシフト（稼働日）も
--   管理し、施工メニューに対する担当者のスキルマッチを出したい。
--
-- 設計（既存を壊さない / 追加のみ）:
--   - staff_members: 作業者の正規エンティティ。社内(user_id あり) / 外注(user_id なし)
--     の両方を 1 テーブルで表す。skills は text[] のタグ。
--   - staff_shifts: 作業者ごとの稼働シフト（日付 + 時間帯）。
--   - reservations.assigned_staff_id: 「実際に施工する担当（職人）」を指す新カラム。
--     既存の assigned_user_id（アカウント責任者 / 証明書発行者の紐付け）は温存し、
--     こちらは触らない。⑦ 職人名×施工証明 はこの assigned_staff_id を起点にする。
--   - staff_roster_stats RPC: assigned_staff_id ベースの担当者別実績（社内/外注を統一集計）。

-- ─── staff_members（作業者レジストリ） ───────────────────────────────────────
create table if not exists staff_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  -- 社内メンバーは auth.users に紐付け（任意）。外注は null。
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null,
  kind        text not null default 'internal' check (kind in ('internal', 'external')),
  email       text,
  phone       text,
  -- スキルタグ（例: 'ppf', 'coating', 'polish', 'wrapping'）。自由タグ。
  skills      text[] not null default '{}',
  -- カレンダー等での識別色（任意）。
  color       text,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- staff_shifts の (tenant_id, staff_id) 複合FK が参照するための一意制約
  -- （id は PK で一意だが、複合FK には (tenant_id, id) の一意制約が必要）。
  unique (tenant_id, id)
);

create index if not exists idx_staff_members_tenant on staff_members(tenant_id);
create index if not exists idx_staff_members_tenant_active on staff_members(tenant_id, is_active);
-- 1 ユーザーを同一テナントで二重登録しない（外注=null は対象外）。
create unique index if not exists uq_staff_members_user
  on staff_members(tenant_id, user_id) where user_id is not null;

alter table staff_members enable row level security;

-- 連絡先・メモ等を含むロスターは members:manage 相当（super_admin/owner/admin）に限定。
-- 案件アサイン用の最小一覧（id/name/kind/skills/is_active のみ）が必要な
-- reservations 系ロールや、証明書発行時の職人名解決は、サービスロールで
-- 列を絞って読む（/api/admin/staff/picker, certificates/new/actions.ts）。
drop policy if exists "staff_members_select" on staff_members;
create policy "staff_members_select" on staff_members
  for select using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
-- 書込は members:manage を持つロール（super_admin / owner / admin）に限定。
-- API ゲートに加え、Supabase クライアント直叩きでの改ざんも RLS で防ぐ。
drop policy if exists "staff_members_insert" on staff_members;
create policy "staff_members_insert" on staff_members
  for insert with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
drop policy if exists "staff_members_update" on staff_members;
create policy "staff_members_update" on staff_members
  for update using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
drop policy if exists "staff_members_delete" on staff_members;
create policy "staff_members_delete" on staff_members
  for delete using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

drop trigger if exists trg_staff_members_updated_at on staff_members;
create trigger trg_staff_members_updated_at
  before update on staff_members
  for each row execute function set_updated_at();

comment on table staff_members is
  '作業者（社内メンバー / 外注職人）のレジストリ。skills でスキルタグ、user_id で社内アカウント連携。';

-- ─── staff_shifts（稼働シフト） ──────────────────────────────────────────────
create table if not exists staff_shifts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  staff_id    uuid not null,
  work_date   date not null,
  start_time  time,
  end_time    time,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- テナント整合を DB レベルで強制（他テナントの staff_id を指せない）。
  -- 単一カラム FK ではなく (tenant_id, staff_id) 複合 FK で参照する。
  foreign key (tenant_id, staff_id) references staff_members (tenant_id, id) on delete cascade
);

create index if not exists idx_staff_shifts_tenant_date on staff_shifts(tenant_id, work_date);
create index if not exists idx_staff_shifts_staff on staff_shifts(staff_id, work_date);

alter table staff_shifts enable row level security;

drop policy if exists "staff_shifts_select" on staff_shifts;
create policy "staff_shifts_select" on staff_shifts
  for select using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
-- 書込は members:manage を持つロール（super_admin / owner / admin）に限定。
-- replace_staff_shifts RPC のロール検査に加え、直接の table 書込も RLS で塞ぐ。
drop policy if exists "staff_shifts_insert" on staff_shifts;
create policy "staff_shifts_insert" on staff_shifts
  for insert with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
drop policy if exists "staff_shifts_update" on staff_shifts;
create policy "staff_shifts_update" on staff_shifts
  for update using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));
drop policy if exists "staff_shifts_delete" on staff_shifts;
create policy "staff_shifts_delete" on staff_shifts
  for delete using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

drop trigger if exists trg_staff_shifts_updated_at on staff_shifts;
create trigger trg_staff_shifts_updated_at
  before update on staff_shifts
  for each row execute function set_updated_at();

-- ─── reservations.assigned_staff_id（施工担当 = 職人） ────────────────────────
-- 既存の assigned_user_id は温存。これは「実際に作業する担当」を指す追加カラム。
-- 新カラム（全行 NULL）への inline REFERENCES なので FK 検証は即時・安全。
-- 検索用インデックスは既存テーブルへの追加 = CONCURRENTLY 必須のため、
-- 必要になった時点で別マイグレーションで張る（現状は tenant_id 絞りで十分）。
alter table reservations
  add column if not exists assigned_staff_id uuid references staff_members(id) on delete set null;

comment on column reservations.assigned_staff_id is
  '施工担当（職人）。staff_members を参照。社内/外注の両方を割当可能。⑦ 施工証明の職人名連携の起点。';

-- ─── staff_roster_stats(p_tenant_id, p_since) ────────────────────────────────
-- assigned_staff_id ベースの担当者別実績（社内/外注を統一集計）。
-- staff_performance_stats（created_by / assigned_user_id ベースの証明書実績）とは
-- 別軸で、こちらは「誰が何件施工を担当したか」を見る。RLS 依存の caller-bound。
create or replace function public.staff_roster_stats(
  p_tenant_id uuid,
  p_since     timestamptz default null
)
returns table (
  staff_id          uuid,
  assignments_total bigint,
  completed         bigint,
  cancelled         bigint,
  avg_work_minutes  numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  -- 担当者別実績はロスター相当（members:view = super_admin/owner/admin）に限定。
  -- 直接 RPC を叩かれても非管理ロールには実績を返さない。
  if not public.tenant_caller_has_role(p_tenant_id, array['super_admin', 'owner', 'admin']) then
    return;
  end if;
  return query
    select
      r.assigned_staff_id as staff_id,
      count(*)::bigint as assignments_total,
      count(*) filter (where r.status = 'completed')::bigint as completed,
      count(*) filter (where r.status = 'cancelled')::bigint as cancelled,
      avg(
        extract(epoch from (r.work_completed_at - r.work_started_at)) / 60.0
      ) filter (
        where r.work_completed_at is not null
          and r.work_started_at is not null
          and r.work_completed_at > r.work_started_at
      )::numeric as avg_work_minutes
    from public.reservations r
    where r.tenant_id = p_tenant_id
      and r.assigned_staff_id is not null
      and (p_since is null or r.created_at >= p_since)
    group by r.assigned_staff_id;
end;
$$;

comment on function public.staff_roster_stats(uuid, timestamptz) is
  '担当者(staff_members)別の施工実績: 担当件数 / 完了 / キャンセル / 平均作業分。assigned_staff_id ベース。';

grant execute on function public.staff_roster_stats(uuid, timestamptz) to anon, authenticated, service_role;

-- ─── replace_staff_shifts(p_staff_id, p_shifts) ──────────────────────────────
-- 指定スタッフの「今日以降」のシフトを一括置換する。delete + insert を 1 つの
-- 関数（=単一トランザクション）で行うため、挿入が失敗しても既存シフトは消えない
-- （アトミック）。テナント所有とメンバーシップを関数内で検証する。
create or replace function public.replace_staff_shifts(p_staff_id uuid, p_shifts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_today  date := current_date;
begin
  select tenant_id into v_tenant from public.staff_members where id = p_staff_id;
  if v_tenant is null then
    raise exception 'staff not found';
  end if;
  -- 直接 RPC を叩かれても低権限ロールがシフトを書き換えられないよう、
  -- members:manage を持つロール（super_admin / owner / admin）に限定する。
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = auth.uid() and lower(role::text) in ('super_admin', 'owner', 'admin')
  ) then
    raise exception 'forbidden';
  end if;

  delete from public.staff_shifts
  where staff_id = p_staff_id and tenant_id = v_tenant and work_date >= v_today;

  insert into public.staff_shifts (id, tenant_id, staff_id, work_date, start_time, end_time, note)
  select gen_random_uuid(), v_tenant, p_staff_id,
         (s->>'work_date')::date,
         nullif(s->>'start_time', '')::time,
         nullif(s->>'end_time', '')::time,
         nullif(s->>'note', '')
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) as s
  where (s->>'work_date')::date >= v_today;
end;
$$;

grant execute on function public.replace_staff_shifts(uuid, jsonb) to authenticated;
