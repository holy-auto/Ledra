-- =============================================================================
-- 予約の「部品交換あり」トグル
--
-- 予約詳細画面のトグルで立てる。ON になった瞬間、サーバ側で当該予約の
-- 部品装着記録（part_installations, status='draft'）を自動作成するために使う
-- （UI 上の新規パネルは追加しない。詳細: docs 該当なし、実装は
--  src/app/api/admin/reservations/route.ts PUT）。
--
-- 破壊的変更なし: 追加カラムのみ（nullable ではないが DEFAULT あり）。
-- =============================================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS parts_replacement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN reservations.parts_replacement IS
  '部品交換あり。ON にした時点でサーバが part_installations (status=draft) を自動作成する。';
