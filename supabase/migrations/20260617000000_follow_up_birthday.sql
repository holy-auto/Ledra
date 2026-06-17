-- 誕生日メッセージ自動送信トリガー
--
-- 背景:
--   フォロー自動化 (follow_up_settings) には施工後フォロー・メンテナンス
--   リマインド・車検前・保証終了前・季節提案など多数のトリガーが既にあるが、
--   「顧客の誕生日にお祝いメッセージを送る」トリガーだけが未実装だった。
--   customers.birth_date は intake で既に取得済み (20260527) のため、
--   送信トリガーを足すだけで誕生日案内を自動化できる。
--
-- 設計:
--   - birthday_enabled: 既定 false（オプトイン。全テナントへ突然送らない）
--   - birthday_lead_days: 誕生日の何日前に送るか。0 = 当日。0〜60 を想定
--     （範囲検証は API 層の Zod で実施。DB CHECK は付けず ALTER を軽量に保つ）
--   - cron は notification_logs.type = 'birthday_<year>' で冪等性を担保
--     （顧客 1 人につき 1 年 1 回だけ送る）
--
-- 影響:
--   ADD COLUMN ... DEFAULT は PostgreSQL 11+ で instant operation
--   （テーブル書き換え不要）。zero-downtime 安全。

alter table public.follow_up_settings
  add column if not exists birthday_enabled boolean not null default false;

comment on column public.follow_up_settings.birthday_enabled is
  '誕生日メッセージ自動送信の ON/OFF。既定 false（オプトイン）。';

alter table public.follow_up_settings
  add column if not exists birthday_lead_days integer not null default 0;

comment on column public.follow_up_settings.birthday_lead_days is
  '誕生日の何日前に送るか。0 = 当日。範囲（0〜60）の検証は API 層（Zod）で実施。';
