-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- RLS ポリシーが **一度も存在しなかったテーブル `tenant_members`** を参照していて、
-- 空 DB へ流すとここで落ち、以降 signature_sessions 系が丸ごと作られなかった。
-- 正しい名前は `tenant_memberships`（本番の実体もそちら。根拠は
-- `20260719000000_fix_rls_membership_references.sql` の実査記録）。
-- 版番号を変えていないので本番では再適用されない＝本番への影響は無い。
-- =============================================================
-- Vehicle Prediction Data Infrastructure
-- 将来の車両劣化・故障予測AIモデル構築のためのデータ基盤
--
-- 追加内容:
--   1. vehicle_mileage_logs        — 走行距離タイムライン
--   2. vehicle_inspection_findings — 構造化された整備所見
--   3. vehicle_part_replacements   — 部品交換履歴（構造化）
--   4. vehicles.ml_training_opt_in — ML学習への同意フラグ
--   5. 自動トリガー: certificates の maintenance_json から走行距離を自動登録
-- =============================================================


-- =============================================================
-- 1. vehicle_mileage_logs — 走行距離タイムライン
-- =============================================================
create table if not exists vehicle_mileage_logs (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants(id) on delete cascade,
  vehicle_id     uuid        not null references vehicles(id) on delete cascade,
  certificate_id uuid        references certificates(id) on delete set null,
  mileage_km     integer     not null check (mileage_km >= 0),
  recorded_at    timestamptz not null,
  source         text        not null default 'manual'
                               check (source in ('maintenance','inspection','manual','obd','import')),
  created_at     timestamptz not null default now()
);

comment on table vehicle_mileage_logs is
  '走行距離タイムライン。整備・車検のたびに記録し、劣化予測モデルの入力として使用する。';

create index if not exists idx_vml_vehicle_time
  on vehicle_mileage_logs (vehicle_id, recorded_at);
create index if not exists idx_vml_tenant
  on vehicle_mileage_logs (tenant_id);

alter table vehicle_mileage_logs enable row level security;

create policy "vml_select" on vehicle_mileage_logs
  for select using (
    tenant_id in (
      select tenant_id from tenant_memberships where user_id = auth.uid()
    )
  );

create policy "vml_insert" on vehicle_mileage_logs
  for insert with check (
    tenant_id in (
      select tenant_id from tenant_memberships where user_id = auth.uid()
    )
  );

-- service_role は全操作可
create policy "vml_service_all" on vehicle_mileage_logs
  for all using (auth.role() = 'service_role');


-- =============================================================
-- 2. vehicle_inspection_findings — 構造化された整備所見
-- =============================================================
create table if not exists vehicle_inspection_findings (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references tenants(id) on delete cascade,
  vehicle_id       uuid        not null references vehicles(id) on delete cascade,
  certificate_id   uuid        references certificates(id) on delete set null,
  mileage_km       integer     check (mileage_km >= 0),
  finding_category text        not null
                                 check (finding_category in (
                                   'engine','transmission','brake','tire','suspension',
                                   'steering','electric','exhaust','cooling','oil',
                                   'battery','body','other'
                                 )),
  finding_severity text        not null default 'ok'
                                 check (finding_severity in ('ok','advisory','warning','critical')),
  finding_code     text,
  finding_note     text,
  inspected_at     timestamptz not null,
  created_at       timestamptz not null default now()
);

comment on table vehicle_inspection_findings is
  '構造化された整備所見。finding_codeは将来のDTCコード統合を見越した予約フィールド。';
comment on column vehicle_inspection_findings.finding_code is
  '将来のOBD-II DTC (例: P0300) または独自コード体系との統合用。現時点は任意。';

create index if not exists idx_vif_vehicle_time
  on vehicle_inspection_findings (vehicle_id, inspected_at);
create index if not exists idx_vif_vehicle_category_severity
  on vehicle_inspection_findings (vehicle_id, finding_category, finding_severity);
create index if not exists idx_vif_tenant
  on vehicle_inspection_findings (tenant_id);

alter table vehicle_inspection_findings enable row level security;

create policy "vif_select" on vehicle_inspection_findings
  for select using (
    tenant_id in (
      select tenant_id from tenant_memberships where user_id = auth.uid()
    )
  );

create policy "vif_insert" on vehicle_inspection_findings
  for insert with check (
    tenant_id in (
      select tenant_id from tenant_memberships where user_id = auth.uid()
    )
  );

create policy "vif_service_all" on vehicle_inspection_findings
  for all using (auth.role() = 'service_role');


-- =============================================================
-- 3. vehicle_part_replacements — 部品交換履歴（構造化）
-- =============================================================
create table if not exists vehicle_part_replacements (
  id                           uuid        primary key default gen_random_uuid(),
  tenant_id                    uuid        not null references tenants(id) on delete cascade,
  vehicle_id                   uuid        not null references vehicles(id) on delete cascade,
  certificate_id               uuid        references certificates(id) on delete set null,
  part_installation_id         uuid        references part_installations(id) on delete set null,
  part_category                text        not null,
  part_name                    text        not null,
  mileage_at_replacement       integer     check (mileage_at_replacement >= 0),
  replaced_at                  timestamptz not null,
  next_replacement_mileage_est integer     check (next_replacement_mileage_est >= 0),
  next_replacement_date_est    date,
  created_at                   timestamptz not null default now()
);

comment on table vehicle_part_replacements is
  '構造化された部品交換履歴。part_categoryは任意文字列（例: brake_pad, tire, engine_oil）。';
comment on column vehicle_part_replacements.next_replacement_mileage_est is
  '整備士が入力する次回交換推奨走行距離。実際の交換タイミングとの差分が予測精度の訓練シグナルになる。';

create index if not exists idx_vpr_vehicle_time
  on vehicle_part_replacements (vehicle_id, replaced_at);
create index if not exists idx_vpr_vehicle_category
  on vehicle_part_replacements (vehicle_id, part_category);
create index if not exists idx_vpr_tenant
  on vehicle_part_replacements (tenant_id);

alter table vehicle_part_replacements enable row level security;

create policy "vpr_select" on vehicle_part_replacements
  for select using (
    tenant_id in (
      select tenant_id from tenant_memberships where user_id = auth.uid()
    )
  );

create policy "vpr_insert" on vehicle_part_replacements
  for insert with check (
    tenant_id in (
      select tenant_id from tenant_memberships where user_id = auth.uid()
    )
  );

create policy "vpr_service_all" on vehicle_part_replacements
  for all using (auth.role() = 'service_role');


-- =============================================================
-- 4. vehicles テーブルへの ML 同意フラグ追加
-- =============================================================
alter table vehicles
  add column if not exists ml_training_opt_in boolean not null default false;

comment on column vehicles.ml_training_opt_in is
  'AIモデル学習へのデータ利用同意。passport_opt_outとは独立した別フラグ。デフォルトはopt-out（false）。';


-- =============================================================
-- 5. 自動トリガー: certificate 保存時に走行距離を自動ログ
--    maintenance_json->>'mileage' が数値であれば vehicle_mileage_logs へ INSERT
-- =============================================================
create or replace function fn_sync_mileage_from_certificate()
returns trigger
language plpgsql
security definer
as $$
declare
  v_mileage integer;
  v_vehicle_id uuid;
  v_tenant_id uuid;
begin
  -- maintenance_json に mileage が含まれる場合のみ処理
  v_mileage := (new.maintenance_json->>'mileage')::integer;
  if v_mileage is null or v_mileage <= 0 then
    return new;
  end if;

  -- certificates から vehicle_id / tenant_id を取得
  v_vehicle_id := new.vehicle_id;
  v_tenant_id  := new.tenant_id;
  if v_vehicle_id is null then
    return new;
  end if;

  -- 同一 certificate_id ですでに記録済みなら重複しない
  insert into vehicle_mileage_logs
    (tenant_id, vehicle_id, certificate_id, mileage_km, recorded_at, source)
  values
    (v_tenant_id, v_vehicle_id, new.id, v_mileage, coalesce(new.created_at, now()), 'maintenance')
  on conflict do nothing;

  return new;
exception
  when others then
    -- トリガーの失敗で本体の保存をブロックしない
    return new;
end;
$$;

drop trigger if exists trg_sync_mileage_from_certificate on certificates;
create trigger trg_sync_mileage_from_certificate
  after insert or update of maintenance_json
  on certificates
  for each row
  execute function fn_sync_mileage_from_certificate();
