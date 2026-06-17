-- ピット管理（ブース）+ 予約へのブース割当 + 所要時間の素材
--
-- 背景:
--   コーティング店は PPFブース / コーティングブース / 磨きブース 等の物理ブースで
--   施工が並行する。どのブースがいつ埋まっているかを可視化し、予約をブースに
--   割り当てたい。さらに施工メニュー × 車両サイズから所要時間を概算したい。
--
-- 設計（既存を壊さない / 追加のみ）:
--   - booths: ブース（区画）マスタ。booth_type は service と揃えたカテゴリ（自由入力可）。
--   - reservations.booth_id: 予約をブースに割当（assigned_staff_id と同じく追加カラム）。
--   - menu_items.estimated_minutes: メニュー単位の基準作業分（所要時間概算の素材）。
--     車両サイズ係数（vehicles.size_class）はアプリ側の純関数で掛ける。

-- ─── booths（ブース／区画） ──────────────────────────────────────────────────
create table if not exists booths (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  -- 区分（'ppf' / 'coating' / 'polish' / 'wrapping' / 'body_repair' / 'other' 等）。自由入力可。
  booth_type  text,
  capacity    integer not null default 1 check (capacity >= 1),
  color       text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_booths_tenant on booths(tenant_id);
create index if not exists idx_booths_tenant_active on booths(tenant_id, is_active);

alter table booths enable row level security;

drop policy if exists "booths_select" on booths;
create policy "booths_select" on booths
  for select using (tenant_id in (select my_tenant_ids()));
-- 書込は reservations:edit を持つロール（super_admin / owner / admin / staff）に限定。
-- ヘルパー public.tenant_caller_has_role は 20260616000001 で定義済み。
drop policy if exists "booths_insert" on booths;
create policy "booths_insert" on booths
  for insert with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin', 'staff']));
drop policy if exists "booths_update" on booths;
create policy "booths_update" on booths
  for update using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin', 'staff']))
  with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin', 'staff']));
drop policy if exists "booths_delete" on booths;
create policy "booths_delete" on booths
  for delete using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin', 'staff']));

drop trigger if exists trg_booths_updated_at on booths;
create trigger trg_booths_updated_at
  before update on booths
  for each row execute function set_updated_at();

comment on table booths is
  'ピット（ブース／区画）マスタ。reservations.booth_id で予約を割当、稼働カレンダーで可視化。';

-- ─── reservations.booth_id（予約のブース割当） ───────────────────────────────
-- 新カラム（全行 NULL）への inline REFERENCES なので FK 検証は即時・安全。
-- 検索用インデックスは既存テーブルへの追加 = CONCURRENTLY 必須のため別途。
alter table reservations
  add column if not exists booth_id uuid references booths(id) on delete set null;

comment on column reservations.booth_id is 'この予約を行うブース（booths を参照）。任意。';

-- ─── menu_items.estimated_minutes（所要時間の基準） ──────────────────────────
-- nullable 追加なのでテーブル書き換えなし・安全。車両サイズ係数はアプリ側で掛ける。
alter table menu_items
  add column if not exists estimated_minutes integer;

comment on column menu_items.estimated_minutes is
  'このメニューの基準作業分（所要時間概算の素材）。車両サイズ係数はアプリ側 estimateReservationMinutes で掛ける。';

-- ─── reservations のテナント整合トリガー ────────────────────────────────────
-- booth_id / assigned_staff_id は単一カラム FK（on delete set null）のため、
-- tenant_id が NOT NULL である reservations では複合 FK が使えない（SET NULL が
-- tenant_id を NULL にしようとして失敗する）。代わりに BEFORE トリガーで
-- 「指す booth / staff が同一テナントか」を強制し、Supabase 直叩きでの
-- クロステナント結合（リークした UUID の悪用）を DB レベルで防ぐ。
create or replace function public.reservations_check_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booth_id is not null and not exists (
    select 1 from public.booths where id = new.booth_id and tenant_id = new.tenant_id
  ) then
    raise exception 'booth % does not belong to tenant %', new.booth_id, new.tenant_id;
  end if;
  if new.assigned_staff_id is not null and not exists (
    select 1 from public.staff_members where id = new.assigned_staff_id and tenant_id = new.tenant_id
  ) then
    raise exception 'staff % does not belong to tenant %', new.assigned_staff_id, new.tenant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservations_check_tenant_refs on reservations;
create trigger trg_reservations_check_tenant_refs
  before insert or update of booth_id, assigned_staff_id on reservations
  for each row execute function public.reservations_check_tenant_refs();
