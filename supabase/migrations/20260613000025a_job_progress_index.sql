-- =============================================================
-- 作業進捗ボード: documents(tenant_id, job_status) インデックス
--
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できない
-- (Supabase は各マイグレーションFILEを tx でラップするが、
--  CONCURRENTLY だけを含むファイルは tx 外で実行される)。
-- そのため 20260613000025_job_progress.sql から本ファイルに分離した。
-- 参照: docs/operations/zero-downtime-migrations.md ルール #1。
--
-- NOTE: 本ファイルは CONCURRENTLY 文のみを含めること。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_job_status
  ON documents (tenant_id, job_status);
