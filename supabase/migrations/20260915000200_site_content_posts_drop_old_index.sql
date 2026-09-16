-- =============================================================
-- site_content_posts — 旧索引 (type, status, published_at) を落とす (CONCURRENTLY)
--
-- 20260915000100 の (site, type, status, published_at) が置き換える。
-- 残すと書き込みのたびに両方を更新することになるので落とす。
-- CONCURRENTLY はトランザクション内で実行できないので、これも単独ファイル。
-- =============================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_site_content_posts_type_status;
