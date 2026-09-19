-- =============================================================================
-- 外注施工履歴 — 支給部品を伴う外注施工の作業依頼（OBJ-001〜003）
--
-- 発注元が部品を用意して施工事業者へ施工を依頼し、受領・照合・施工・完了確認までの
-- 履歴を Ledra 上で一貫して追う。状態語彙は src/lib/domain/states.ts の
-- OUTSOURCED_WORK_STATES（25 値）をそのまま格納する（正準値との対応表を持たない）。
-- 遷移表は src/lib/domain/transitions.ts、実行主体・復帰先制御は
-- src/lib/outsourcedWork/rules.ts。**遷移の正当性はアプリ層（service.ts）が判定し、
-- DB は「完了後に状態を動かせない」（TR-048 / TR-052）と「イベントは追記専用」
-- （AC-025 / ADR-0003）だけを強制する。**
--
-- 本マイグレーションが作るもの:
--   1. outsourced_work_requests   … 作業依頼（TERM-001 / EVD-001）
--   2. outsourced_supplied_parts  … 支給部品（TERM-002 / EVD-002）
--   3. outsourced_receipt_attempts… 受領試行（TERM-003 / EVD-003）。拒否後も上書きしない
--   4. outsourced_work_events     … 全工程のイベント（EVD-004〜017）追記専用
--
-- テナント分離（PER-028）: 発注元と施工事業者は別テナント。両方のメンバーが SELECT でき、
-- 書き込みは API（service-role）経由のみ。RLS に書き込みポリシーを置かない理由は、
-- 権限マトリクス（PER-001〜027）が「テナントのロール × その依頼での立場 × 指名」で
-- 決まり、RLS 式では表現しきれないため（staff_link_invites と同じ作法）。
--
-- 既存の job_orders（BtoB 受発注）とは別テーブル。job_orders.status は
-- pending/accepted/... の別語彙で、1つの列に2軸を混ぜない（CLAUDE.md）。
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) outsourced_work_requests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outsourced_work_requests (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 発注元（部品を用意し、作業を指定する側）
  client_tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_store_id               uuid REFERENCES stores(id) ON DELETE SET NULL,
  -- 施工事業者（受領・照合・施工を記録する側）
  contractor_tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  -- 自社発注・自社施工は外注ではない
  CONSTRAINT outsourced_work_requests_distinct_tenants CHECK (client_tenant_id <> contractor_tenant_id),

  -- 対象車両（発注元の vehicles 行があれば紐付け。無くても VIN と表示名で特定できる）
  vehicle_id                    uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  vin                           text NOT NULL,
  vehicle_label                 text,
  work_description              text NOT NULL,
  due_date                      date,
  order_number                  text,
  customer_note                 text,
  comment                       text,

  status                        text NOT NULL DEFAULT 'REQUEST_CREATED'
    CHECK (status IN (
      'REQUEST_CREATED','PARTS_PREPARED','AWAITING_HANDOVER','RECEIPT_IN_REVIEW','RECEIVED','MATCHED',
      'READY_FOR_WORK','WORK_IN_PROGRESS','WORK_COMPLETED','AWAITING_CLIENT_CONFIRMATION','COMPLETED',
      'QUANTITY_SHORTAGE','PART_NUMBER_MISMATCH','DAMAGE_REVIEW','RECEIPT_REJECTED','WORK_INTERRUPTED',
      'EXCEPTION_APPROVAL_PENDING','EXCEPTION_APPROVED','EXCEPTION_REJECTED','RETURNED',
      'REWORK_PENDING','REWORK_IN_PROGRESS','REWORK_COMPLETED','ON_HOLD','CANCELED'
    )),
  -- 例外承認申請・作業保留の発生元（PER-029: 復帰先の絞り込みに使う）
  exception_origin_status       text
    CHECK (exception_origin_status IS NULL OR exception_origin_status IN (
      'QUANTITY_SHORTAGE','PART_NUMBER_MISMATCH','DAMAGE_REVIEW','WORK_INTERRUPTED','RETURNED'
    )),
  -- 進行中の受領試行（受領拒否で終端になったら次の試行が新しい行になる）
  current_receipt_attempt_id    uuid,
  -- 施工担当者割当（PER-009）
  assigned_worker_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 「設定時のみ」の権限（PER-015〜019）: 発注元が依頼ごとに指名する
  designated_reviewer_user_ids  uuid[] NOT NULL DEFAULT '{}',
  designated_approver_user_ids  uuid[] NOT NULL DEFAULT '{}',

  approved_by                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at                   timestamptz,
  completed_at                  timestamptz,

  -- 証明データ（AC-026 / EVD-018）。ハッシュは最後に生成したもの。履歴は events。
  evidence_hash                 text,
  evidence_generated_at         timestamptz,

  created_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outsourced_work_requests_client
  ON outsourced_work_requests (client_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outsourced_work_requests_contractor
  ON outsourced_work_requests (contractor_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outsourced_work_requests_status
  ON outsourced_work_requests (status);

CREATE TRIGGER trg_outsourced_work_requests_updated_at
  BEFORE UPDATE ON outsourced_work_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE outsourced_work_requests IS
  '支給部品を伴う外注施工の作業依頼。status は src/lib/domain/states.ts OUTSOURCED_WORK_STATES をそのまま格納。完了後は状態を動かせない（トリガ）。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) outsourced_supplied_parts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outsourced_supplied_parts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES outsourced_work_requests(id) ON DELETE CASCADE,
  part_number           text NOT NULL,
  part_name             text NOT NULL,
  quantity              numeric(12,2) NOT NULL CHECK (quantity > 0),
  -- 写真はストレージのパス（アップロード経路は既存の証跡ストレージを使う）
  photo_paths           text[] NOT NULL DEFAULT '{}',
  label_photo_paths     text[] NOT NULL DEFAULT '{}',
  prepared_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at           timestamptz,
  handed_over_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handed_over_at        timestamptz,
  handover_comment      text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outsourced_supplied_parts_request
  ON outsourced_supplied_parts (request_id);

CREATE TRIGGER trg_outsourced_supplied_parts_updated_at
  BEFORE UPDATE ON outsourced_supplied_parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) outsourced_receipt_attempts — 受領ごとに新しい行。拒否後も上書きしない（TERM-003）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outsourced_receipt_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES outsourced_work_requests(id) ON DELETE CASCADE,
  attempt_no            integer NOT NULL CHECK (attempt_no > 0),
  started_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at            timestamptz NOT NULL DEFAULT now(),
  -- 受領結果（EVD-003）。pending → accepted（受領済み）/ rejected（受領拒否＝この試行の終端）
  result                text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','accepted','rejected')),
  received_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at           timestamptz,
  -- 部品ごとの現物: [{ part_id, received_quantity, actual_part_number, appearance, packaging, photo_paths }]
  lines                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment               text,
  rejected_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at           timestamptz,
  rejection_reason      text,
  -- 拒否後に開始した次の試行（AC-014: 旧受領試行 → 新受領試行）
  superseded_by_attempt_id uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, attempt_no)
);

CREATE TRIGGER trg_outsourced_receipt_attempts_updated_at
  BEFORE UPDATE ON outsourced_receipt_attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) outsourced_work_events — 追記専用（AC-025 / EVD-016）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outsourced_work_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES outsourced_work_requests(id) ON DELETE CASCADE,
  -- STATUS_TRANSITION / VERIFICATION / EXCEPTION_REPORTED / EXCEPTION_APPROVAL /
  -- REWORK / CORRECTION / WORKER_ASSIGNED / PART_ADDED / EVIDENCE_GENERATED / ACCESS_DENIED ...
  event_type            text NOT NULL,
  from_status           text,
  to_status             text,
  actor_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_tenant_id       uuid REFERENCES tenants(id) ON DELETE SET NULL,
  -- rules.ts の OutsourcedActorRole、または 'system'
  actor_role            text NOT NULL,
  reason                text,
  receipt_attempt_id    uuid REFERENCES outsourced_receipt_attempts(id) ON DELETE SET NULL,
  -- 承認イベント → 申請イベント、復帰遷移 → 承認イベント などのリンク
  related_event_id      uuid REFERENCES outsourced_work_events(id) ON DELETE SET NULL,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outsourced_work_events_request
  ON outsourced_work_events (request_id, created_at);

COMMENT ON TABLE outsourced_work_events IS
  '外注施工の全工程イベント。追記専用（UPDATE/DELETE はトリガで拒否）。訂正は CORRECTION イベントを追記する（EVD-017）。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) ガード: イベントは追記専用、完了した作業依頼の状態は動かない
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.outsourced_work_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
begin
  raise exception 'outsourced_work_events is append-only (%)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

CREATE TRIGGER trg_outsourced_work_events_append_only
  BEFORE UPDATE OR DELETE ON outsourced_work_events
  FOR EACH ROW EXECUTE FUNCTION public.outsourced_work_events_append_only();

-- TR-048 / TR-052 / AC-024: 完了後の状態変更を DB でも拒否する。service-role も例外にしない。
-- 完了後に許されるのは訂正イベント・再施工イベントの追記と、証明データ列の更新だけ。
CREATE OR REPLACE FUNCTION public.outsourced_work_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
begin
  if old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
    raise exception 'completed work request % cannot change status (use CORRECTION / REWORK events)', old.id
      using errcode = 'restrict_violation';
  end if;
  if old.status = 'COMPLETED' and (
    new.work_description is distinct from old.work_description
    or new.vin is distinct from old.vin
    or new.contractor_tenant_id is distinct from old.contractor_tenant_id
    or new.client_tenant_id is distinct from old.client_tenant_id
  ) then
    raise exception 'completed work request % is frozen (record a CORRECTION event instead)', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

CREATE TRIGGER trg_outsourced_work_requests_guard
  BEFORE UPDATE ON outsourced_work_requests
  FOR EACH ROW EXECUTE FUNCTION public.outsourced_work_requests_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RLS — 発注元・施工事業者の両メンバーが参照。書き込みは API（service-role）のみ。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE outsourced_work_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourced_supplied_parts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourced_receipt_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourced_work_events      ENABLE ROW LEVEL SECURITY;

CREATE POLICY outsourced_work_requests_select ON outsourced_work_requests
  FOR SELECT USING (
    client_tenant_id IN (SELECT my_tenant_ids()) OR contractor_tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY outsourced_supplied_parts_select ON outsourced_supplied_parts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM outsourced_work_requests r
      WHERE r.id = outsourced_supplied_parts.request_id
        AND (r.client_tenant_id IN (SELECT my_tenant_ids()) OR r.contractor_tenant_id IN (SELECT my_tenant_ids()))
    )
  );

CREATE POLICY outsourced_receipt_attempts_select ON outsourced_receipt_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM outsourced_work_requests r
      WHERE r.id = outsourced_receipt_attempts.request_id
        AND (r.client_tenant_id IN (SELECT my_tenant_ids()) OR r.contractor_tenant_id IN (SELECT my_tenant_ids()))
    )
  );

CREATE POLICY outsourced_work_events_select ON outsourced_work_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM outsourced_work_requests r
      WHERE r.id = outsourced_work_events.request_id
        AND (r.client_tenant_id IN (SELECT my_tenant_ids()) OR r.contractor_tenant_id IN (SELECT my_tenant_ids()))
    )
  );
