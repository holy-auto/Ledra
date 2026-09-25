-- =============================================================
-- 指定整備記録簿（完成検査）測定値の構造化保存  [G5 / Phase 1a]
--
-- 第三号様式(四輪)/第四号様式(二輪) の「検査機器等による検査」測定値を、様式に
-- 沿って構造化保存する。手入力・外部取込の両経路が同一スキーマへ書き込み、
-- source 列で来歴を区別する（DECISION_LOG 2026-09-24「構造化スキーマ共通・
-- 書き込み口2つ」）。
--
--   - inspection_records.inspection_type に 'completion'(完成検査) を追加
--   - inspection_records.record_retention_until を追加（指定整備記録簿=完成検査は2年保存）
--   - inspection_measurements: 測定セル1件=1行（field_code + 数値/テキスト + 単位 + 合否 + 来歴）
--
-- RLS: 既存 inspection_records と同一方針（my_tenant_ids() でテナント分離）。
-- ponytail: 様式の field_code カタログ・単位・様式別の該当はアプリ層(Zod)で定義し、
--   DB は汎用に保つ（様式改定を data で吸収。IMP-001 の6軸には該当しない
--   ＝ inspection_type は domain/states.ts の管理対象外）。上限は「DB では未知の
--   field_code を弾けない」点で、アプリ層カタログ検証がその境界を担う。
-- =============================================================

-- 1) inspection_type に 完成検査 を追加（既存の inline CHECK を drop → NOT VALID で再作成）。
--    値の追加なので既存行は必ず満たす。フルスキャンのロックを避けるため NOT VALID とし、
--    VALIDATE は別マイグレーション（..._validate_inspection_type_completion）で行う
--    （repo の _validate_* 慣習に合わせる）。
alter table inspection_records
  drop constraint if exists inspection_records_inspection_type_check;
alter table inspection_records
  add constraint inspection_records_inspection_type_check
  check (inspection_type in ('intake', 'delivery', 'periodic', 'completion')) not valid;

-- 2) 保存期限（完成検査＝指定整備記録簿は2年保存。body_repair_jobs と同じ考え方）
alter table inspection_records
  add column if not exists record_retention_until date;

-- 3) 測定値テーブル（1セル=1行）
create table if not exists inspection_measurements (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  inspection_record_id uuid not null references inspection_records(id) on delete cascade,
  -- 様式の測定セルを一意に指す論理コード（カタログはアプリ層 Zod で定義）。例:
  --   'brake.front_front.right' / 'brake.axle_weight.front' / 'brake.lr_diff.front'
  --   'brake.total' / 'brake.parking.right' / 'vehicle_weight'
  --   'headlight.intensity.right.main' / 'headlight.aim.right' / 'fog_lamp.right'
  --   'horn_db' / 'speedometer_error' / 'exhaust_noise_db'
  --   'obd_result' / 'co' / 'hc' / 'diesel_smoke' / 'tire_runout' / 'side_slip'
  field_code           text not null,
  num_value            numeric,          -- 数値測定値（制動力・光度・CO 濃度 等）
  text_value           text,             -- 非数値（サイドスリップのイン/アウト・聴感 等）
  unit                 text,             -- 'N'|'kg'|'cd'|'km/h'|'dB'|'%'|'ppm'|'mm/m' 等（様式の単位切替を保持）
  judgment             text check (judgment in ('pass', 'fail', 'na')),  -- 良/否/該当なし
  -- 来歴（真実性・G2 と一体）: 手入力か外部取込か・測定機器・測定時刻・入力者
  source               text not null default 'manual' check (source in ('manual', 'imported')),
  device               text,
  measured_at          timestamptz,
  created_by           uuid,             -- auth.users.id（cross-schema FK は張らない既存慣習）
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (inspection_record_id, field_code)
);

create index if not exists idx_im_tenant on inspection_measurements(tenant_id);
-- record 単位の lookup / FK cascade は unique(inspection_record_id, field_code) の
-- 先頭列インデックスが担うため、専用の record インデックスは張らない（冗長回避）。

-- 4) RLS — inspection_measurements（inspection_records と同一方針）
alter table inspection_measurements enable row level security;

drop policy if exists inspection_measurements_tenant_select on inspection_measurements;
create policy inspection_measurements_tenant_select on inspection_measurements
  for select using (tenant_id in (select my_tenant_ids()));

-- insert/update の with check は tenant_id だけでなく、参照先 inspection_record_id が
-- 自テナントの記録であることも要求する。これが無いと、他テナントの記録 id を指す行を
-- 自テナント名義で作れ、unique(inspection_record_id, field_code) により相手のセルを
-- 先取りして正当な insert を阻害できる（クロステナント汚染/DoS）。
drop policy if exists inspection_measurements_tenant_insert on inspection_measurements;
create policy inspection_measurements_tenant_insert on inspection_measurements
  for insert with check (
    tenant_id in (select my_tenant_ids())
    and inspection_record_id in (
      select id from inspection_records where tenant_id in (select my_tenant_ids())
    )
  );

drop policy if exists inspection_measurements_tenant_update on inspection_measurements;
create policy inspection_measurements_tenant_update on inspection_measurements
  for update using (tenant_id in (select my_tenant_ids()))
  with check (
    tenant_id in (select my_tenant_ids())
    and inspection_record_id in (
      select id from inspection_records where tenant_id in (select my_tenant_ids())
    )
  );

drop policy if exists inspection_measurements_tenant_delete on inspection_measurements;
create policy inspection_measurements_tenant_delete on inspection_measurements
  for delete using (tenant_id in (select my_tenant_ids()));

-- 5) updated_at トリガー（core_tables の set_updated_at() を再利用）
drop trigger if exists trg_inspection_measurements_updated_at on inspection_measurements;
create trigger trg_inspection_measurements_updated_at
  before update on inspection_measurements
  for each row execute function set_updated_at();
