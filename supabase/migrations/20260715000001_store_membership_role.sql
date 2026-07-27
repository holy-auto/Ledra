-- 支社（店舗）ごとの担当者（責任者/担当）設定
--
-- 背景:
--   store_memberships は店舗とユーザーの多対多テーブルとして既に存在するが、
--   role カラムが無く「誰が店長で誰が一般担当か」を表現できなかった。また
--   user_id に外部キー制約が無く、削除済みユーザーの割当が残り得た。
--   支社登録画面から実ユーザーを役割付きで担当者アサインできるようにする。

-- ─── role カラム追加（店長 / 担当） ───────────────────────────────────────────
-- 既存行は空テーブル想定だが、NOT NULL DEFAULT 'staff' で安全に埋める
-- （lint-migrations の add-column-not-null-without-default は DEFAULT 付きなら許容）。
ALTER TABLE store_memberships
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staff';

ALTER TABLE store_memberships
  DROP CONSTRAINT IF EXISTS store_memberships_role_check;

ALTER TABLE store_memberships
  ADD CONSTRAINT store_memberships_role_check
  CHECK (role IN ('manager', 'staff'))
  NOT VALID;

ALTER TABLE store_memberships
  VALIDATE CONSTRAINT store_memberships_role_check;

COMMENT ON COLUMN store_memberships.role IS
  '店舗内での役割。manager = 店長/責任者、staff = 一般担当。';

-- ─── user_id への外部キー制約追加 ────────────────────────────────────────────
-- 既存データが無い前提のため NOT VALID でも即座に VALIDATE が通る。
-- lint-migrations の add-foreign-key-without-not-valid 規約に従う。
ALTER TABLE store_memberships
  DROP CONSTRAINT IF EXISTS store_memberships_user_id_fkey;

ALTER TABLE store_memberships
  ADD CONSTRAINT store_memberships_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE store_memberships
  VALIDATE CONSTRAINT store_memberships_user_id_fkey;
