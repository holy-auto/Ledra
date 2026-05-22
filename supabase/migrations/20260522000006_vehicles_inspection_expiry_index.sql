-- =============================================================
-- vehicles: inspection_expiry_date 用の partial index (CONCURRENTLY)
--
-- Cron が「N 日後に期限を迎える車両」を全テナントで日次スキャンする。
-- 期限の入っていない車両 (大多数) はインデックスから除外。
-- CONCURRENTLY なので別ファイル化 (transaction 内不可)。
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicles_inspection_expiry
  ON vehicles (inspection_expiry_date)
  WHERE inspection_expiry_date IS NOT NULL;
