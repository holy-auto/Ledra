-- NexPTG（膜厚計）連携用テーブル
-- POST /api/external/nexptg/sync が書き込む。
--
-- データ粒度:
--   thickness_reports        … NexPTGレポート1件（車両1台分の測定セッション）
--   thickness_measurements   … レポート内の個別測定値（外装 / 内装）
--   thickness_tires          … レポート内のタイヤ情報
--   thickness_history_items  … NexPTGの「history」（レポートに紐付かない測定履歴）
--
-- 冪等性:
--   (tenant_id, external_report_id) で upsert。
--   NexPTGはインクリメンタル同期だが、再送による二重登録を防ぐ。

-- =============================================================
-- 1) thickness_reports
-- =============================================================
create table if not exists thickness_reports (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants (id) on delete cascade,
  vehicle_id            uuid references vehicles (id) on delete set null,
  external_report_id    text not null,
  name                  text,
  measured_at           timestamptz,
  calibration_at        timestamptz,
  device_serial_number  text,
  brand                 text,
  model                 text,
  vin                   text,
  year                  text,
  type_of_body          text,
  capacity              text,
  power                 text,
  fuel_type             text,
  unit_of_measure       text,
  comment               text,
  extra_fields          jsonb not null default '[]'::jsonb,
  raw_payload           jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, external_report_id)
);

create index if not exists idx_thickness_reports_tenant on thickness_reports (tenant_id);
create index if not exists idx_thickness_reports_vehicle on thickness_reports (vehicle_id) where vehicle_id is not null;
create index if not exists idx_thickness_reports_vin on thickness_reports (tenant_id, vin) where vin is not null and vin <> '';
create index if not exists idx_thickness_reports_measured_at on thickness_reports (tenant_id, measured_at desc);

-- =============================================================
-- 2) thickness_measurements
-- =============================================================
create table if not exists thickness_measurements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  report_id       uuid not null references thickness_reports (id) on delete cascade,
  is_inside       boolean not null default false,
  place_id        text not null check (place_id in ('left', 'right', 'top', 'back')),
  section         text not null,
  position        integer,
  value_um        numeric,
  raw_value       text,
  interpretation  integer check (interpretation between 1 and 5),
  material        text,
  measured_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_thickness_meas_tenant on thickness_measurements (tenant_id);
create index if not exists idx_thickness_meas_report on thickness_measurements (report_id);
create index if not exists idx_thickness_meas_section on thickness_measurements (report_id, is_inside, place_id, section);

-- =============================================================
-- 3) thickness_tires
-- =============================================================
create table if not exists thickness_tires (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  report_id    uuid not null references thickness_reports (id) on delete cascade,
  section      text,
  maker        text,
  season       text,
  width        text,
  profile      text,
  diameter     text,
  value1       text,
  value2       text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_thickness_tires_report on thickness_tires (report_id);

-- =============================================================
-- 4) thickness_history_items (NexPTGの history 配列)
-- =============================================================
create table if not exists thickness_history_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (id) on delete cascade,
  external_group_id text not null,
  group_name        text,
  value_um          numeric,
  raw_value         text,
  interpretation    integer check (interpretation between 1 and 5),
  material          text,
  measured_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (tenant_id, external_group_id, measured_at, raw_value)
);

create index if not exists idx_thickness_hist_tenant on thickness_history_items (tenant_id, measured_at desc);

-- =============================================================
-- 5) updated_at trigger for thickness_reports
-- =============================================================
create trigger trg_thickness_reports_updated_at
  before update on thickness_reports
  for each row execute function set_updated_at();

-- =============================================================
-- 6) Row-Level Security
--    書き込みは Service Role（APIルート）のみ、テナントメンバーは参照可能。
-- =============================================================
alter table thickness_reports enable row level security;
alter table thickness_measurements enable row level security;
alter table thickness_tires enable row level security;
alter table thickness_history_items enable row level security;

create policy "thickness_reports_select" on thickness_reports
  for select using (tenant_id in (select my_tenant_ids()));

create policy "thickness_measurements_select" on thickness_measurements
  for select using (tenant_id in (select my_tenant_ids()));

create policy "thickness_tires_select" on thickness_tires
  for select using (tenant_id in (select my_tenant_ids()));

create policy "thickness_history_items_select" on thickness_history_items
  for select using (tenant_id in (select my_tenant_ids()));

comment on table thickness_reports is 'NexPTG膜厚計レポート。POST /api/external/nexptg/sync が書き込む。';
comment on table thickness_measurements is 'NexPTG測定値。place_id=left/right/top/back, is_inside で外装/内装を区別。';
comment on table thickness_tires is 'NexPTGレポートに付随するタイヤ情報。';
comment on table thickness_history_items is 'NexPTG history 配列（レポートに紐付かない測定ログ）。';
