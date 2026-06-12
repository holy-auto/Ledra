-- =============================================================
-- SMS/メール自動配信強化 (Multi-channel Notification Broadcast) Migration
-- 既存の LINE 一斉配信 (line_broadcasts) に SMS (Twilio) / メール
-- (Resend→SendGrid) チャネルを加えた統合配信テーブル。
--
-- channel:
--   'sms'   : 電話番号 (customers.phone) 宛 Twilio SMS
--   'email' : メールアドレス (customers.email) 宛メール
--   'line'  : LINE userId (customers.line_user_id) 宛 LINE Push
--   'push'  : Web Push (将来)
--
-- segment_json: line_broadcasts と同形式 ({ segment_type, filters })
--   - "all"          : 当該チャネルの宛先を持つ全顧客
--   - "no_visit_days" : 最終来店からの経過日 (列未整備のため当面 all 相当)
--   - "vehicle_type"  : 指定メーカーの車両を持つ顧客
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() で
--      テナント分離する。INSERT / UPDATE は staff 以上 (my_tenant_role) に
--      限定し、SELECT は全テナントメンバーへ許可する。
-- =============================================================

create table if not exists notification_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  name            text not null,
  -- 配信チャネル
  channel         text not null check (channel in ('sms', 'email', 'line', 'push')),
  subject         text,                 -- メール件名 (email channel)
  message_text    text not null check (char_length(message_text) <= 2000),
  -- セグメント条件 (line_broadcasts と同形式)
  segment_json    jsonb not null default '{"segment_type":"all"}'::jsonb,
  -- 状態
  status          text not null default 'draft'
                    check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  target_count    integer,
  sent_count      integer default 0,
  failed_count    integer default 0,
  -- 担当者 (auth.users id。cross-schema の複雑さを避けるため FK は張らない)
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_nb_tenant on notification_broadcasts (tenant_id);
create index if not exists idx_nb_status on notification_broadcasts (tenant_id, status);

alter table notification_broadcasts enable row level security;

-- SELECT: 全テナントメンバー
drop policy if exists notification_broadcasts_tenant_select on notification_broadcasts;
create policy notification_broadcasts_tenant_select on notification_broadcasts
  for select using (tenant_id in (select my_tenant_ids()));

-- INSERT: staff 以上
drop policy if exists notification_broadcasts_tenant_insert on notification_broadcasts;
create policy notification_broadcasts_tenant_insert on notification_broadcasts
  for insert with check (
    tenant_id in (select my_tenant_ids())
    and my_tenant_role(tenant_id) in ('owner', 'admin', 'staff')
  );

-- UPDATE: staff 以上
drop policy if exists notification_broadcasts_tenant_update on notification_broadcasts;
create policy notification_broadcasts_tenant_update on notification_broadcasts
  for update using (
    tenant_id in (select my_tenant_ids())
    and my_tenant_role(tenant_id) in ('owner', 'admin', 'staff')
  )
  with check (
    tenant_id in (select my_tenant_ids())
    and my_tenant_role(tenant_id) in ('owner', 'admin', 'staff')
  );

-- DELETE: owner / admin
drop policy if exists notification_broadcasts_tenant_delete on notification_broadcasts;
create policy notification_broadcasts_tenant_delete on notification_broadcasts
  for delete using (
    tenant_id in (select my_tenant_ids())
    and my_tenant_role(tenant_id) in ('owner', 'admin')
  );

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_notification_broadcasts_updated_at on notification_broadcasts;
create trigger set_notification_broadcasts_updated_at
  before update on notification_broadcasts
  for each row execute function set_updated_at();
