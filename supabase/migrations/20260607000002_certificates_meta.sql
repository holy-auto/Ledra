-- =============================================================
-- certificates.meta
--
-- 証明書単位の注釈 (JSON) を格納する汎用列。以下の既存 / 新規コードが共通で使う:
--   - photo.auto_tampering_check  → certificates.meta.tampering_check
--   - photo.auto_quality_check    → certificates.meta.quality_check
--   - 証明書詳細ページ (admin/certificates/[public_id]) の meta 読み出し
--
-- これらの機能はコード上 certificates.meta を参照していたが、列を追加する
-- migration が欠落していた (本番にも未作成)。本 migration で補完する。
-- nullable で追加 (zero-downtime: NOT NULL DEFAULT を避ける / コードは null を許容)。
-- IF NOT EXISTS で再実行に耐える。既存 RLS (certs_*) がそのまま適用される。
-- =============================================================

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS meta jsonb;
