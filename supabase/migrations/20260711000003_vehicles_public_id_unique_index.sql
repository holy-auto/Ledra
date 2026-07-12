-- =============================================================
-- vehicles.public_id — 一意インデックス (CONCURRENTLY)
--
-- /s/v/[publicId] のタグ解決ルックアップに使う。別ファイルにしたのは
-- CREATE INDEX CONCURRENTLY がトランザクション内で実行できないため
-- (20260522000002_passport_owner_email_index.sql と同じ作法)。
-- 部分インデックス (public_id IS NOT NULL) で実値の一意性のみ担保する。
-- =============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicles_public_id
  ON vehicles (public_id)
  WHERE public_id IS NOT NULL;
