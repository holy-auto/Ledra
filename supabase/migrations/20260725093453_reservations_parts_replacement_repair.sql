-- =============================================================================
-- 修復: reservations.parts_replacement カラムの再適用
--
-- 20260714000003_reservations_parts_replacement は schema_migrations 上は「適用済み」
-- として記録されているが、本番 DB では実際のカラムが存在しない状態にドリフトしていた
-- （記録だけ残り DDL が反映されなかった／後に消えた）。`supabase db push` は記録済みの
-- マイグレーションを再実行しないため、コード側が参照する parts_replacement 列が無いまま
-- になり、予約 PUT（ステータス前進・編集）の RETURNING 句が毎回 500 を返していた
-- （src/app/api/admin/reservations/route.ts）。
--
-- 破壊的変更なし: 追加カラムのみ・IF NOT EXISTS・DEFAULT false で冪等。
-- =============================================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS parts_replacement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN reservations.parts_replacement IS
  '部品交換あり。ON にした時点でサーバが part_installations (status=draft) を自動作成する。';
