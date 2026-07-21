-- ============================================================
-- site_content_posts に「お知らせ(news)」種別を追加する。
-- 既存の type CHECK 制約（blog/event/webinar のみ）を差し替える。
--
-- CHECK 制約は元マイグレーションでインライン定義（列制約）なので Postgres 既定名
-- 「site_content_posts_type_check」になるが、環境差で名前がずれても確実に落とせるよう、
-- 名前ではなく定義内容（'blog' を含む type の CHECK）で特定して DROP する。
-- 値を広げるだけ（既存行は全て充足）なので、追加は NOT VALID → VALIDATE で軽ロックにする
-- （CLAUDE.md のマイグレーション規約）。
-- ============================================================

DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.site_content_posts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%blog%';  -- type の CHECK のみ 'blog' を含む
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.site_content_posts DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.site_content_posts
  ADD CONSTRAINT site_content_posts_type_check
  CHECK (type IN ('blog', 'news', 'event', 'webinar')) NOT VALID;

ALTER TABLE public.site_content_posts
  VALIDATE CONSTRAINT site_content_posts_type_check;
