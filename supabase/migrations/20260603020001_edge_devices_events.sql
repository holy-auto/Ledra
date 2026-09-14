-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- RLS ポリシーが `tenant_memberships.is_active` を参照していたが、**この列は本番にも無い**。
-- そのままだと CREATE POLICY 時に落ち、空 DB へ1パスで流せない。
-- 述語を落として本番の実体に合わせた（根拠: `20260719000000_fix_rls_membership_references.sql`
-- の [B]。本番の pg_policies 実査で is_active 述語なしと確認されている）。
-- 版番号を変えていないので本番では再適用されない＝本番への影響は無い。
-- Edge AI / DePIN テーブル
-- エッジデバイス（スマートグラス、工場カメラ等）の登録と
-- リアルタイムワークイベントの収集・ブロックチェーン記録

-- エッジデバイス登録テーブル
create table if not exists public.edge_devices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  kind              text not null check (kind in (
    'smart_glasses', 'ip_camera', 'obd_dongle',
    'torque_wrench', 'thickness_gauge', 'barcode_scanner', 'mobile_device'
  )),
  display_name      text not null,
  status            text not null default 'active' check (status in ('active', 'inactive', 'revoked')),
  -- シークレットは SHA-256 ハッシュのみを保存（生値は登録時に一度のみ返す）
  device_key_hash   text not null,
  firmware_version  text,
  last_seen_at      timestamptz,
  registered_at     timestamptz not null default now(),
  metadata          jsonb not null default '{}'
);

create index if not exists edge_devices_tenant_id_idx
  on public.edge_devices (tenant_id);

create index if not exists edge_devices_status_idx
  on public.edge_devices (tenant_id, status);

alter table public.edge_devices enable row level security;

create policy "tenant members can manage edge devices"
  on public.edge_devices for all
  using (
    tenant_id in (
      select tenant_id from public.tenant_memberships
      where user_id = auth.uid()
    )
  );

-- エッジイベントテーブル
create table if not exists public.edge_events (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  device_id         uuid not null references public.edge_devices(id) on delete cascade,
  -- デバイス側のイベント ID（冪等性用）
  device_event_id   text not null,

  kind              text not null check (kind in (
    'work_started', 'part_scanned', 'measurement_taken',
    'work_step_completed', 'work_completed',
    'quality_check', 'anomaly_detected', 'photo_captured'
  )),
  payload           jsonb not null default '{}',

  -- 紐付け（任意）
  job_order_id      uuid references public.job_orders(id) on delete set null,
  vehicle_id        uuid references public.vehicles(id) on delete set null,

  -- 整合性
  content_hash      text not null,
  device_timestamp  timestamptz not null,
  received_at       timestamptz not null default now(),

  -- Polygon アンカー
  polygon_tx_hash   text,
  polygon_network   text check (polygon_network in ('polygon', 'amoy')),
  polygon_anchored_at timestamptz
);

-- 冪等性制約（同一デバイスの同一イベント ID は 1 件のみ）
create unique index if not exists edge_events_device_event_unique
  on public.edge_events (device_id, device_event_id);

create index if not exists edge_events_tenant_id_received_idx
  on public.edge_events (tenant_id, received_at desc);

create index if not exists edge_events_job_order_id_idx
  on public.edge_events (job_order_id) where job_order_id is not null;

create index if not exists edge_events_vehicle_id_idx
  on public.edge_events (vehicle_id) where vehicle_id is not null;

create index if not exists edge_events_kind_idx
  on public.edge_events (tenant_id, kind);

alter table public.edge_events enable row level security;

create policy "tenant members can read edge events"
  on public.edge_events for select
  using (
    tenant_id in (
      select tenant_id from public.tenant_memberships
      where user_id = auth.uid()
    )
  );

comment on table public.edge_devices is
  'DePIN エッジデバイス: スマートグラス・工場カメラ・計測機器等の登録管理。デバイス認証は HMAC-SHA256 ベース。';

comment on table public.edge_events is
  'エッジデバイスからのリアルタイムワークイベント。各イベントは SHA-256 コンテンツハッシュで改ざん検知し、Polygon に自動アンカー。';
