-- =============================================================
-- 予約通知用 Slack Webhook URL
--
-- 顧客予約（customer/booking, external/booking）が入った際、テナントの
-- オーナー/管理者へメール通知するのに加え、任意でテナント単位の Slack
-- Incoming Webhook にも通知できるようにする。未設定なら Slack 通知は
-- 無条件でスキップされる（lib/slack.ts の notifySlack が no-op）。
-- =============================================================

alter table tenants
  add column if not exists booking_notify_slack_webhook_url text;

comment on column tenants.booking_notify_slack_webhook_url is
  '予約が入った際にテナント側へ通知する Slack Incoming Webhook URL。未設定なら Slack 通知はスキップ。';
