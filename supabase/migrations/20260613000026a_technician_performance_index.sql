-- =============================================================
-- 技術者別パフォーマンス: documents(tenant_id, assigned_user_id) インデックス
--
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため
-- 20260613000026_technician_performance.sql から本ファイルに分離した。
-- 参照: docs/operations/zero-downtime-migrations.md ルール #1。
--
-- NOTE: 本ファイルは CONCURRENTLY 文のみを含めること。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_assigned_user
  ON documents (tenant_id, assigned_user_id);
