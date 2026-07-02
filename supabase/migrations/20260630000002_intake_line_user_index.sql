-- =============================================================================
-- customer_intake_invitations.line_user_id 索引 (CONCURRENTLY)
--
-- Companion to 20260630000001 (line_user_id カラム追加)。
-- CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため別ファイル。
-- webhook で「同一 line_user_id の未完了招待が既にあるか」を引くための部分索引。
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intake_line_user
  ON customer_intake_invitations (tenant_id, line_user_id)
  WHERE line_user_id IS NOT NULL;
