-- =============================================================
-- site_content_posts — 公開読み取り用の索引に site を足す (CONCURRENTLY)
--
-- 公開読み取りは site='ledra' で絞るようになった（3サイト共通テーブル化、
-- 20260915000000）。先頭が type のままだと site の絞り込みが索引で効かない。
--
-- 別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で
-- 実行できないため（20260711000003_vehicles_public_id_unique_index.sql と同じ作法）。
-- 旧索引の削除は 20260915000200。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_site_content_posts_site_type_status
  ON public.site_content_posts (site, type, status, published_at DESC);
