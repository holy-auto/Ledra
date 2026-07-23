-- =============================================================
-- 予約通知用 Slack Webhook URL（暗号化列）
--
-- 顧客予約（customer/booking, external/booking）が入った際、テナントの
-- オーナー/管理者へメール通知するのに加え、任意でテナント単位の Slack
-- Incoming Webhook にも通知できるようにする。未設定なら Slack 通知は
-- 無条件でスキップされる（lib/slack.ts の notifySlack が no-op）。
--
-- Webhook URL は投稿権限を持つ実行可能な秘密情報のため、LINE channel secret /
-- Square OAuth トークンと同じ規約（src/lib/crypto/tenantSecrets.ts の
-- buildSecretWrite/readSecret）に従い、平文ではなく暗号化列として保存する。
-- =============================================================

alter table tenants
  add column if not exists booking_notify_slack_webhook_ciphertext text;

comment on column tenants.booking_notify_slack_webhook_ciphertext is
  '予約が入った際にテナント側へ通知する Slack Incoming Webhook URL（暗号化）。
   src/lib/crypto/tenantSecrets.ts の buildSecretWrite/readSecret で読み書きする。未設定なら Slack 通知はスキップ。';
