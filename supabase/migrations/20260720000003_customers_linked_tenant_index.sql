-- =============================================================
-- customers.linked_tenant_id 索引 (CONCURRENTLY)
--
-- 受注側 customers から from_tenant_id を引き当てるルックアップ用。別ファイルにしたのは
-- CREATE INDEX CONCURRENTLY がトランザクション内で実行できないため（既存の索引追加と同作法）。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_linked_tenant
  ON customers (tenant_id, linked_tenant_id)
  WHERE linked_tenant_id IS NOT NULL;
