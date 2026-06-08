-- =============================================================
-- certificates.quality_fields_json
--
-- 発行フォームの品質チェック (auditCertificatePhotos) は「ライブのフォーム入力値
-- (フラットな field_values)」を前提に設計されている。アップロード時のサーバ自動
-- 品質監査 (photo.auto_quality_check) を **誤検知なく** 再現するため、作成時に
-- フォームが算出したフラットな field_values スナップショットをここに保存する。
-- (永続化後の証明書はフィールドをネスト JSON で保持しており、警告ルールが期待する
--  フラットキーと一致しないため、スナップショットを別途持たせる。)
--
-- nullable で追加 (zero-downtime: NOT NULL DEFAULT を避ける)。IF NOT EXISTS で
-- 再実行に耐える。既存 RLS (certs_*) がそのまま適用される。
-- =============================================================

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS quality_fields_json jsonb;
