-- 本番にあって、マイグレーションが作らなかった一意索引（20260921093300 のヘッダを参照）。
-- 定義は本番の pg_get_indexdef と同一（lower() の式索引・部分索引）。本番では no-op。
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS tenants_custom_domain_uniq
  ON public.tenants USING btree (lower(custom_domain))
  WHERE (custom_domain IS NOT NULL);
