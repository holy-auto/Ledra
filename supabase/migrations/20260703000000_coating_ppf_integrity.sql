-- =============================================================================
-- コーティング・PPF施工インテグリティ — Phase 1
--
-- 設計: docs/coating-ppf-integrity-design.md
--
-- 部品交換用に作った part_installations 基盤 (docs/parts-installation-integrity-design.md)
-- をそのまま再利用する。コーティング剤・PPFフィルムは "consumable" (シリアル無し消耗品) の
-- part_kind に合致するため、新テーブルは作らず certificate_id で紐付けるだけでよい。
--
-- 支援索引 (CONCURRENTLY) は companion migration 20260703000001 に分離する
-- （CREATE INDEX CONCURRENTLY はトランザクション内で実行できないため）。
--
-- 破壊的変更なし: 既存カラムは追加のみ（nullable）。
-- =============================================================================

ALTER TABLE part_installations
  ADD COLUMN IF NOT EXISTS certificate_id uuid REFERENCES certificates(id) ON DELETE SET NULL;

COMMENT ON COLUMN part_installations.certificate_id IS
  'コーティング・PPF施工証明書からの装着記録の場合の紐付け先。job_order_id と併用可（どちらか/両方あってもよい）。';
