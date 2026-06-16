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
drop policy if exists "booths_insert" on booths;
create policy "booths_insert" on booths
  for insert with check (tenant_id in (select my_tenant_ids()));
drop policy if exists "booths_update" on booths;
create policy "booths_update" on booths
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));
drop policy if exists "booths_delete" on booths;
create policy "booths_delete" on booths
  for delete using (tenant_id in (select my_tenant_ids()));

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
