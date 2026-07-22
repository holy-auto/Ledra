-- site_content_posts に「記事CTA」「OGP」のオーバーライド列を追加する。
-- これまで MDX 記事だけが frontmatter で持てた CTA（例: /poc・保険会社導線）と OGP を、
-- CMS(HPコンテンツ管理)の投稿でもブラウザから編集できるようにする。
--
-- すべて nullable。未指定なら記事側で既定値にフォールバックする（既存投稿は無変更で動く）。
-- 列追加のみ（デフォルト無し）＝Postgres ではメタデータ変更で即時・テーブル書き換え無し・低リスク。
ALTER TABLE site_content_posts
  ADD COLUMN IF NOT EXISTS cta_title text,
  ADD COLUMN IF NOT EXISTS cta_subtitle text,
  ADD COLUMN IF NOT EXISTS cta_primary_label text,
  ADD COLUMN IF NOT EXISTS cta_primary_href text,
  ADD COLUMN IF NOT EXISTS cta_secondary_label text,
  ADD COLUMN IF NOT EXISTS cta_secondary_href text,
  ADD COLUMN IF NOT EXISTS og_title text,
  ADD COLUMN IF NOT EXISTS og_subtitle text;
