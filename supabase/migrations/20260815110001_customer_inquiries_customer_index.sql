-- =============================================================
-- customer_inquiries.customer_id 索引 (CONCURRENTLY)
--
-- LINE ログインのセッションは下4桁ハッシュを持たず customer_id で問い合わせを引くため。
-- 別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で実行できないため
-- (既存の索引追加と同作法)。列の追加は 20260815110000 側。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_inquiries_tenant_customer
  ON customer_inquiries (tenant_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
