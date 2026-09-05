-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- Maintenance reminder enhancements
--
-- 背景:
--   `processMaintenanceReminders` を service_type 別スケジュール / 顧客 opt-out /
--   AI パーソナライズに対応させる。データ層の変更を 1 本にまとめる。
--
-- 設計:
--   1. customers.followup_opt_out: 顧客側で「フォローアップを送らないで」を
--      明示できるフラグ。default false で既存挙動と互換。cron はこのフラグが
--      true の顧客には送信しない。
--   2. follow_up_settings.maintenance_schedule_by_service: 施工種別ごとに
--      リマインド月数の上書きを保持する JSONB。
--
--      例: { "ppf": [6, 12, 24], "coating": [3, 6], "body_repair": [1] }
--
--      キーが存在する施工種別はその配列を優先し、未指定の種別は
--      maintenance_reminder_months (テナント既定) にフォールバック。
--      空オブジェクト ({}) のときは従来通り全種別に既定値を使う。
--
-- 互換性:
--   - 既存テナントの follow_up_settings 行は ALTER で {} を default に持つ
--     ので、追加直後の挙動は不変。
--   - customers.followup_opt_out も default false なので、既存顧客は全員
--     opt-in 状態のまま。

alter table public.customers
  add column if not exists followup_opt_out boolean not null default false;

comment on column public.customers.followup_opt_out is
  'true のとき、メンテナンスリマインダー / フォローアップ通知の送信対象から除外する。顧客マイページや CS 対応で立てる。';

alter table public.follow_up_settings
  add column if not exists maintenance_schedule_by_service jsonb not null default '{}'::jsonb;

comment on column public.follow_up_settings.maintenance_schedule_by_service is
  '施工種別ごとのメンテナンス月数 override。例: {"ppf":[6,12,24],"coating":[3,6]}。キー未指定の種別は maintenance_reminder_months (テナント既定) を使う。';

-- followup_opt_out の検索高速化 (cron が WHERE followup_opt_out = false を頻繁に引く)。
-- CONCURRENTLY を外したので transaction 内で走る（このファイルは 2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）。
-- IF NOT EXISTS で再実行安全。
create index if not exists idx_customers_followup_opt_out
  on public.customers (tenant_id)
  where followup_opt_out = false;
