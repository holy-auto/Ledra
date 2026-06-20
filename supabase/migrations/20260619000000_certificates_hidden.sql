-- =============================================================
-- Certificates: 非表示 (hidden) フラグ
-- 施工証明書にミスがあった場合などに、一覧から非表示にして
-- 管理しやすくするためのフラグ。void (無効化) とは別概念で、
-- ステータスを変えずに一覧の表示/非表示のみを切り替える。
-- 既存の is_archived パターン (service_packages) に倣う。
-- =============================================================

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN certificates.is_hidden IS
  '非表示フラグ。true の場合は管理画面の通常一覧から除外される (void とは独立)。';

-- 通常一覧は is_hidden = false を created_at 降順で引くため、複合インデックスを張る
CREATE INDEX IF NOT EXISTS idx_certs_tenant_hidden_created
  ON certificates (tenant_id, is_hidden, created_at DESC);
