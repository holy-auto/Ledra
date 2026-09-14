-- =============================================================
-- 車体整備の消費者に対する透明性確保 ガイドライン準拠強化
--   出典: 国土交通省 物流・自動車局 自動車整備課
--        「車体整備の消費者に対する透明性確保に向けたガイドライン」
--        (令和6年3月)
--
-- 本マイグレーションはガイドライン「4.2 実施することが求められる取組み」
-- (1)〜(5) に対応する構造をスキーマに追加する:
--   (1) 画像情報の3段階記録   → certificate_images.stage
--   (2) 作業の予定/実績記録     → body_repair_jobs.planned_work_json /
--                                  actual_work_json / deviation_reason /
--                                  is_specified_maintenance / record_retention_until /
--                                  recorded_by
--   (3) 料金の予定/実績記録     → body_repair_jobs.actual_amount /
--                                  estimate_document_id / invoice_document_id
--   (4) 情報の関連付け          → body_repair_jobs.certificate_id (画像) +
--                                  estimate/invoice document FK (料金)
--   (5) 説明と書面同意          → signature_sessions.purpose 拡張 +
--                                  body_repair_consents テーブル
-- =============================================================

-- =============================================================
-- (1) 画像情報の3段階記録
--     ガイドライン 4.2(1): ①入庫後〜作業開始前 ②作業実施中 ③作業実施後
--     の各段階で画像を記録すること。撮影時刻は既存 exif_captured_at /
--     created_at で担保済みのため、ここでは「どの段階の画像か」を表す
--     stage 列を追加する。
-- =============================================================
alter table certificate_images
  add column if not exists stage text not null default 'unspecified'
    check (stage in ('intake_before', 'in_progress', 'after', 'unspecified'));

comment on column certificate_images.stage is
  '車体整備ガイドライン4.2(1)の撮影段階。'
  'intake_before=入庫後〜作業開始前 / in_progress=作業実施中 / after=作業実施後 / unspecified=未指定(証明書一般写真)。';

-- 段階別の事後検証クエリ用 index は既存テーブルへの追加のため、書込ロックを
-- 避けるべく companion migration 20260620000001 で CONCURRENTLY 作成する。

-- =============================================================
-- (2)(3)(4) body_repair_jobs の拡張
-- =============================================================
alter table body_repair_jobs
  -- (4) 情報の関連付け: 画像(証明書)・料金(帳票)を案件=車両単位で束ねる
  add column if not exists certificate_id        uuid references certificates (id) on delete set null,
  add column if not exists estimate_document_id  uuid references documents (id) on delete set null,
  add column if not exists invoice_document_id   uuid references documents (id) on delete set null,
  -- (2) 作業の内容・方法 (予定 / 実績) と差異理由
  --     JSON 構造例: { repair_type, panels:[], methods, parts, paint }
  add column if not exists planned_work_json     jsonb not null default '{}'::jsonb,
  add column if not exists actual_work_json      jsonb not null default '{}'::jsonb,
  add column if not exists deviation_reason      text,
  -- (2) 特定整備該当フラグと記録保存期限 (特定整備記録簿は2年保存)
  add column if not exists is_specified_maintenance boolean not null default false,
  add column if not exists record_retention_until   date,
  -- (2) 記録者 (auth.users id。cross-schema FK は他列に倣い張らない)
  add column if not exists recorded_by           uuid,
  -- (3) 料金の実績
  add column if not exists actual_amount         numeric(12, 0);

comment on column body_repair_jobs.certificate_id is
  'ガイドライン4.2(4): 画像情報(certificates / certificate_images)との関連付け。';
comment on column body_repair_jobs.estimate_document_id is
  'ガイドライン4.2(3)(4): 概算見積り(documents doc_type=estimate)との関連付け。';
comment on column body_repair_jobs.invoice_document_id is
  'ガイドライン4.2(3)(4): 実績請求/納品(documents doc_type=invoice/delivery)との関連付け。';
comment on column body_repair_jobs.planned_work_json is
  'ガイドライン4.2(2)①: 作業開始前に予定している作業内容・方法・部品・塗料。';
comment on column body_repair_jobs.actual_work_json is
  'ガイドライン4.2(2)②: 実際に行った作業内容・方法・部品・塗料。';
comment on column body_repair_jobs.deviation_reason is
  'ガイドライン4.2(2)②: 実績が予定と異なる場合の理由。';
comment on column body_repair_jobs.is_specified_maintenance is
  '実施した車体整備が特定整備に該当するか。該当時は特定整備記録簿として2年保存が必要。';
comment on column body_repair_jobs.record_retention_until is
  'ガイドライン4.2: 記録の電磁的保存期限。特定整備は完了から2年。事後検証可能性の担保。';
comment on column body_repair_jobs.recorded_by is
  'ガイドライン4.2(2): 当該情報の記録者 (auth.users.id)。';
comment on column body_repair_jobs.actual_amount is
  'ガイドライン4.2(3)②: 実施した車体整備の実績料金 (円)。';

-- body_repair_jobs は既存テーブルのため、FK covering index / retention 抽出用
-- index は companion migration 20260620000001 で CONCURRENTLY 作成する
-- (元は CREATE INDEX CONCURRENTLY のため別ファイル。2026-09-04 に CONCURRENTLY は外した)。

-- =============================================================
-- (5) 消費者等への説明と書面同意
--     ガイドライン 4.2(5): ①作業前 ②作業中(変更時) ③作業後 の各段階で
--     説明し書面などにて了承を得ること。
--     既存の受領サイン基盤 (signature_sessions / 二要素 / 同意文ハッシュ /
--     Polygon アンカリング) を再利用するため purpose を拡張する。
-- =============================================================
-- NOT VALID で追加し VALIDATE CONSTRAINT で検証することで ACCESS EXCLUSIVE 下の
-- 全行スキャンを回避する (既存行は拡張前の許容値なので必ず通る)。
alter table signature_sessions drop constraint if exists signature_sessions_purpose_check;
alter table signature_sessions
  add constraint signature_sessions_purpose_check
  check (purpose in ('certificate', 'delivery_receipt', 'estimate_consent', 'change_consent')) not valid;
alter table signature_sessions validate constraint signature_sessions_purpose_check;

comment on column signature_sessions.purpose is
  '署名の用途。certificate=証明書 / delivery_receipt=受領サイン(作業後) / '
  'estimate_consent=作業前の見積同意 / change_consent=作業中の変更同意。';

-- 案件単位の同意レコード (作業前 / 変更時 / 作業後)。
create table if not exists body_repair_consents (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants (id) on delete cascade,
  body_repair_job_id   uuid not null references body_repair_jobs (id) on delete cascade,
  -- 同意の種別: pre_work=作業前 / change=作業中の変更 / post_work=作業後(受領)
  kind                 text not null
                         check (kind in ('pre_work', 'change', 'post_work')),
  -- 紐づく署名セッション (1 同意 = 1 セッション)
  signature_session_id uuid references signature_sessions (id) on delete set null,
  status               text not null default 'pending'
                         check (status in ('pending', 'signed', 'expired', 'cancelled')),
  -- 説明内容のスナップショット (見積・作業内容・料金など。後から不変)
  explanation_json     jsonb not null default '{}'::jsonb,
  signed_at            timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table body_repair_consents is
  '車体整備ガイドライン4.2(5): 作業前/変更時/作業後の消費者等への説明と書面同意の記録。';
comment on column body_repair_consents.explanation_json is
  '同意時点で消費者等へ提示した説明内容のスナップショット (見積・作業内容・料金等)。後から不変。';

create index if not exists idx_brc_tenant on body_repair_consents (tenant_id);
create index if not exists idx_brc_job on body_repair_consents (body_repair_job_id);
create index if not exists idx_brc_session
  on body_repair_consents (signature_session_id) where signature_session_id is not null;
create index if not exists idx_brc_pending
  on body_repair_consents (tenant_id, status, created_at desc) where status = 'pending';

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_body_repair_consents_updated_at on body_repair_consents;
create trigger set_body_repair_consents_updated_at
  before update on body_repair_consents
  for each row execute function set_updated_at();

-- RLS: body_repair_jobs と同じく my_tenant_ids() でテナント分離。
alter table body_repair_consents enable row level security;

drop policy if exists "tenant members can read body repair consents" on body_repair_consents;
create policy "tenant members can read body repair consents"
  on body_repair_consents for select
  using (tenant_id in (select my_tenant_ids()));

drop policy if exists "staff can insert body repair consents" on body_repair_consents;
create policy "staff can insert body repair consents"
  on body_repair_consents for insert
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists "staff can update body repair consents" on body_repair_consents;
create policy "staff can update body repair consents"
  on body_repair_consents for update
  using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists "staff can delete body repair consents" on body_repair_consents;
create policy "staff can delete body repair consents"
  on body_repair_consents for delete
  using (tenant_id in (select my_tenant_ids()));
