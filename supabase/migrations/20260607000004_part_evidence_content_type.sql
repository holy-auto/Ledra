-- =============================================================
-- part_installation_evidence.content_type
--
-- 納品書 (delivery_note) 画像をサーバ側で保存し、アップロード時に自動 OCR +
-- 三方照合 (parts.auto_reconcile_delivery_note) を回すための土台。
-- 保存済み画像を後から OCR するには media type が必要だが、evidence 表に
-- content_type 列が無かったため追加する (storage_path とセットで使う)。
--
-- nullable で追加 (zero-downtime)。IF NOT EXISTS で再実行に耐える。
-- 追記専用テーブルのため UPDATE/DELETE ポリシーは無いが、OCR 結果の
-- キャッシュ書き戻し (ocr_extracted) は service-role で行う。
-- =============================================================

ALTER TABLE part_installation_evidence
  ADD COLUMN IF NOT EXISTS content_type text;
