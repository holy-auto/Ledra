-- ============================================================
-- site_content_posts に「お知らせ(news)」種別を追加する。
-- 既存の type CHECK 制約（blog/event/webinar のみ）を差し替える。
-- CHECK 制約はインライン定義のため、Postgres 既定の自動命名
-- 「<table>_<column>_check」= site_content_posts_type_check を DROP し、
-- 新しい許可値で追加する。値を広げるだけ（既存行は全て充足）なので
-- NOT VALID → VALIDATE で軽ロックにする（CLAUDE.md のマイグレーション規約）。
-- ============================================================

ALTER TABLE site_content_posts
  DROP CONSTRAINT IF EXISTS site_content_posts_type_check;

ALTER TABLE site_content_posts
  ADD CONSTRAINT site_content_posts_type_check
  CHECK (type IN ('blog', 'news', 'event', 'webinar')) NOT VALID;

ALTER TABLE site_content_posts
  VALIDATE CONSTRAINT site_content_posts_type_check;
