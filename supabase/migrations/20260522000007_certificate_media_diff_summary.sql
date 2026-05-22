-- =============================================================
-- certificate_media: AI 生成のビフォーアフター差分サマリ
--
-- before_after メディアに対し Claude Vision を呼んで、
-- 「何が変化したか」の自然言語サマリを生成し、公開ページの
-- BeforeAfterSlider 隣に表示できるようにする。
--
-- - diff_summary: 公開可能なテキスト (PII を含まない指示で生成)
-- - diff_summary_generated_at: いつ生成したか
-- - diff_summary_model: 使ったモデル名 (再生成可否の判断材料)
--
-- 生成は admin 経由の明示トリガーのみ (cost 抑制 + UX 制御)。
-- =============================================================

ALTER TABLE certificate_media
  ADD COLUMN IF NOT EXISTS diff_summary              text,
  ADD COLUMN IF NOT EXISTS diff_summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS diff_summary_model        text;

COMMENT ON COLUMN certificate_media.diff_summary IS
  'Claude Vision によるビフォーアフター差分サマリ。公開ページに表示するため PII を含めない指示で生成。';
COMMENT ON COLUMN certificate_media.diff_summary_model IS
  '生成に使用した AI モデル名 (例: claude-opus-4-5)。バージョン管理 + 再生成判定用。';
