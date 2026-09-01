-- =============================================================
-- certificates.job_order_id 索引 (CONCURRENTLY)
--
-- /admin/orders/[id] が発注に紐づく施工証明を引く（受発注の双方が見る画面）ための
-- ルックアップ用。別ファイルにしたのは CREATE INDEX CONCURRENTLY がトランザクション内で
-- 実行できないため（20260720000003 と同作法）。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_job_order
  ON certificates (job_order_id)
  WHERE job_order_id IS NOT NULL;
