-- =============================================================
-- 受発注に紐づく請求書は 1 job_order = 1 invoice を構造的に保証する
--
-- src/lib/orders/orderInvoice.ts の ensure は「存在チェック → 無ければ INSERT」で
-- 冪等化しているが、二入口（orders PUT / inspection-sign）からの呼び出しに対する
-- 最終防壁として部分ユニーク索引を張る（TOCTOU の残余を構造で潰す）。
-- consolidated_invoice は複数 job_order を集約するため対象外（doc_type='invoice' 限定）。
-- =============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_job_order_invoice_unique
  ON documents (job_order_id)
  WHERE doc_type = 'invoice' AND job_order_id IS NOT NULL;
