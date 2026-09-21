-- 本番にあって、マイグレーションが作らなかった一意索引（20260921093300 のヘッダを参照）。
-- 定義は本番の pg_get_indexdef と同一。本番では no-op。
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS vehicles_public_id_uidx
  ON public.vehicles USING btree (public_id);
