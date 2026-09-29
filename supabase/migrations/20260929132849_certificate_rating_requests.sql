-- =============================================================
-- certificate_rating_requests: 証明書発行の数日後に施工店の顧客へ送る評価依頼
-- （IMP-029 rating_request / DECISION_LOG 2026-09-27）
--
-- 1行 = 1証明書への評価依頼と、その回答（星評価 + 任意コメント）。
--   - 発行時（triggerCertificateIssued）に send_after = 発行 + N日 で1行作る
--   - cron（/api/cron/follow-up）が send_after を過ぎた未送信行を sent_at で条件付き更新して
--     「取った」行だけ送る（二重送信防止）。certificate_id の UNIQUE で依頼自体も1証明書1回
--   - 顧客は /rate/[token]（ログイン不要）から1回だけ回答できる（submitted_at IS NULL 条件付き更新）
--
-- 受領サイン直後のその場レビュー signature_reviews とは別物として扱う（統合しない＝代表判断）。
-- 状態は status 列ではなく時刻列（sent_at / submitted_at）で持つ（IMP-001 の状態語彙を増やさない）。
--
-- RLS: signature_reviews と同方針。テナント所属メンバーは閲覧可、owner/admin は更新・削除可。
-- INSERT とトークン経由の回答は service-role 経由のみ（公開 token フロー）。
-- =============================================================

create table if not exists certificate_rating_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  certificate_id uuid not null references certificates (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  token text not null,
  send_after timestamptz not null,
  sent_at timestamptz,
  rating integer check (rating between 1 and 5),
  comment text,
  submitted_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint certificate_rating_requests_certificate_uniq unique (certificate_id),
  constraint certificate_rating_requests_token_uniq unique (token),
  constraint certificate_rating_requests_rating_with_submit check ((rating is null) = (submitted_at is null))
);

comment on table certificate_rating_requests is
  '証明書発行の数日後に顧客へ送る評価依頼と回答（星評価 + 任意コメント）。signature_reviews とは別。';
comment on column certificate_rating_requests.send_after is 'この時刻以降に cron が送信する（発行時刻 + 既定日数）。';
comment on column certificate_rating_requests.sent_at is 'cron が送信を取った時刻（NULL = 未送信）。';
comment on column certificate_rating_requests.submitted_at is '顧客が評価を送信した時刻（NULL = 未回答）。';

-- cron の未送信スキャン（send_after 到来かつ sent_at IS NULL）
create index if not exists idx_certificate_rating_requests_pending
  on certificate_rating_requests (send_after) where sent_at is null;
-- 管理画面の一覧・FK 被覆
create index if not exists idx_certificate_rating_requests_tenant
  on certificate_rating_requests (tenant_id, created_at desc);
create index if not exists idx_certificate_rating_requests_customer
  on certificate_rating_requests (customer_id) where customer_id is not null;

alter table certificate_rating_requests enable row level security;

drop policy if exists certificate_rating_requests_tenant_select on certificate_rating_requests;
drop policy if exists certificate_rating_requests_tenant_update on certificate_rating_requests;
drop policy if exists certificate_rating_requests_tenant_delete on certificate_rating_requests;

create policy certificate_rating_requests_tenant_select on certificate_rating_requests
  for select using (tenant_id in (select my_tenant_ids()));

create policy certificate_rating_requests_tenant_update on certificate_rating_requests
  for update using (
    tenant_id in (select my_tenant_ids())
    and my_tenant_role(tenant_id) in ('owner', 'admin')
  );

create policy certificate_rating_requests_tenant_delete on certificate_rating_requests
  for delete using (
    tenant_id in (select my_tenant_ids())
    and my_tenant_role(tenant_id) in ('owner', 'admin')
  );
