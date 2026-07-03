-- =============================================================
-- 案件サインオフ・ワークフロー (全業種共通)
--
-- 「作業完了 → 証明書発行(施工前後写真) → お客様サイン → お会計 →
--  オンチェーン」を 1 本の順序付きフローとして予約(案件)に結線する。
--
-- 既存資産の再利用:
--   - お客様サインは既存の受領サイン (delivery_receipts /
--     signature_sessions purpose='delivery_receipt') をそのまま使う。
--   - オンチェーンは受領サイン署名時の Polygon アンカー・証明書アンカーが
--     既に自動発火するため、本マイグレーションでは新設しない。
--
-- 本マイグレーションが埋める「繋ぎ」:
--   1. 受領サインを予約に直結する reservation_id ブリッジ
--      (今まで delivery_receipts / signature_sessions は certificates に
--       しかぶら下がっておらず、案件が「サイン済みか」を知らなかった)。
--   2. 予約側のサインオフ状態 (未依頼 / 署名待ち / 署名済) と
--      「不在時 24 時間以内にサイン」の SLA 期限。
-- =============================================================

-- 1. 受領サイン ↔ 予約 ブリッジ ------------------------------------
-- signature_sessions.certificate_id は 20260621000002 で nullable 化済み。
-- reservation_id を足して案件起点のサインオフを追跡できるようにする。
alter table signature_sessions
  add column if not exists reservation_id uuid references reservations(id) on delete set null;

comment on column signature_sessions.reservation_id is
  '案件サインオフ・ワークフローで受領サインを発行した予約 (reservations.id)。'
  '証明書起点の従来フローでは NULL。';

alter table delivery_receipts
  add column if not exists reservation_id uuid references reservations(id) on delete set null;

comment on column delivery_receipts.reservation_id is
  '受領サインを発行した予約 (reservations.id)。案件サインオフ・ワークフロー由来のみ設定。';

create index if not exists idx_signature_sessions_reservation
  on signature_sessions (reservation_id)
  where reservation_id is not null;

create index if not exists idx_delivery_receipts_reservation
  on delivery_receipts (reservation_id)
  where reservation_id is not null;

-- 2. 予約側サインオフ状態 + 24h SLA -------------------------------
alter table reservations
  add column if not exists signoff_status text not null default 'not_requested'
    check (signoff_status in ('not_requested', 'awaiting', 'signed'));

alter table reservations
  add column if not exists signoff_requested_at timestamptz;

alter table reservations
  add column if not exists signoff_deadline timestamptz;

alter table reservations
  add column if not exists signed_off_at timestamptz;

comment on column reservations.signoff_status is
  'お客様サインオフ状態。not_requested=未依頼 / awaiting=署名待ち / signed=署名済。';
comment on column reservations.signoff_requested_at is
  '受領サイン依頼を発行した時刻。';
comment on column reservations.signoff_deadline is
  'お客様不在時のサイン期限 (依頼時刻 + 24h の SLA)。超過は overdue として警告表示するが、'
  'サインリンク自体は signature_sessions.expires_at (既定 72h) まで有効。';
comment on column reservations.signed_off_at is
  'お客様が受領サインを完了した時刻 (delivery_receipts 署名時に自動記録)。';

-- 署名待ちの案件を素早く一覧するための部分インデックス (overdue 監視用)。
create index if not exists idx_reservations_signoff_awaiting
  on reservations (tenant_id, signoff_deadline)
  where signoff_status = 'awaiting';
