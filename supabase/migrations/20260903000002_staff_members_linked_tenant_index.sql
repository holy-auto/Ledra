-- =============================================================
-- staff_members.linked_tenant_id 索引 (CONCURRENTLY)
--
-- 外注テナントが「自分が作業した記録」を引くとき、全元請けを横断して
-- linked_tenant_id = 自分 の職人行を探す。その逆引き用。
-- 別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で
-- 実行できないため（20260720000003 と同作法）。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_members_linked_tenant
  ON staff_members (linked_tenant_id)
  WHERE linked_tenant_id IS NOT NULL;
