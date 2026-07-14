-- =============================================================================
-- part_installations に 'draft' ステータスを追加
--
-- 予約の「部品交換あり」トグル ON で作業前の最小限レコードを status='draft' で
-- 自動作成し、証明書発行（施工後写真が保証される時点）で status='installed' に
-- 一括更新する（実装: src/lib/certificates/issueHooks.ts）。
--
-- 状態機械: draft → installed → customer_verified（他は現状通り disputed / voided）。
-- 既存行はすべて 'installed' 以降のため、CHECK 制約の入れ替えに検証エラーは出ない。
-- 完全凍結ガード (20260603000001) は OLD.status IN ('customer_verified','voided') の
-- ときだけ動くため、'draft' の追加は既存ガードと無矛盾。
-- =============================================================================

-- NOT VALID でテーブル全体スキャン (ACCESS EXCLUSIVE) を避け、VALIDATE CONSTRAINT で
-- 別途検証する (lint-migrations の add-check-without-not-valid 規約)。既存行はすべて
-- 'installed' 以降のため VALIDATE は必ず通る。
ALTER TABLE part_installations
  DROP CONSTRAINT IF EXISTS part_installations_status_check;

ALTER TABLE part_installations
  ADD CONSTRAINT part_installations_status_check
  CHECK (status IN ('draft','installed','customer_verified','disputed','voided'))
  NOT VALID;

ALTER TABLE part_installations
  VALIDATE CONSTRAINT part_installations_status_check;

COMMENT ON COLUMN part_installations.status IS
  '状態機械: draft（作業前・写真未要求）→ installed（証明書発行等で施工後写真確認済み）→ customer_verified（確定/完全凍結）。disputed/voided は別枝。';
