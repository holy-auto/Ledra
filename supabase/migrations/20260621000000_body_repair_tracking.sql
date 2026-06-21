-- =============================================================
-- 車体整備 工程の「見える化」(ガイドライン4.3(A))
--   顧客へ共有する進捗トラッキング用の不透明トークンを body_repair_jobs に追加。
--   トークンを知る人だけが /track/[token] で工程進捗を閲覧できる
--   (顧客ログイン不要・PII 最小)。
--
-- 一意索引は既存テーブルへの追加のため、書込ロックを避けるべく companion
-- migration 20260621000001 で CREATE UNIQUE INDEX CONCURRENTLY する。
-- =============================================================

alter table body_repair_jobs
  add column if not exists track_token text;

comment on column body_repair_jobs.track_token is
  '顧客向け進捗トラッキング用の不透明トークン (ガイドライン4.3 見える化)。'
  'NULL=未発行。発行は /api/admin/body-repair-jobs/[id]/track-link。';
