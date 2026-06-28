-- =============================================================
-- 車体整備 納期 (due_date)
--   完成予定日を案件に持たせ、一覧/ガントで「期限超過」を可視化する
--   (ギャップ監査 docs/body-repair-clerical-gap-audit-2026-06.md 断絶B)。
--   nullable 追加のみ (zero-downtime)。超過判定はアプリ層
--   (due_date < 当日 かつ stage != delivered) で行う。
-- =============================================================

alter table body_repair_jobs
  add column if not exists due_date date;

comment on column body_repair_jobs.due_date is
  '完成予定日 (納期)。NULL=未設定。超過 (due_date < 当日 かつ未出庫) は一覧で警告表示。';
