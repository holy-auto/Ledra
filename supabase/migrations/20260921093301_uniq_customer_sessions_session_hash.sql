-- 本番にあって、マイグレーションが作らなかった一意索引（20260921093300 のヘッダを参照）。
-- 定義は本番の pg_get_indexdef と同一。本番では既に在るので no-op。
-- CONCURRENTLY のため1ファイル1文（Supabase はマイグレーションをパイプラインで送るので
-- 2文目以降が SQLSTATE 25001 で落ちる）。
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS customer_sessions_session_hash_uniq
  ON public.customer_sessions USING btree (session_hash);
