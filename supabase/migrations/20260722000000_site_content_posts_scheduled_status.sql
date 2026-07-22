-- site_content_posts の status に 'scheduled'（予約公開）を追加する。
-- 予約投稿: status='scheduled' ＋ published_at=未来時刻 として保存し、cron
-- (/api/cron/publish-scheduled) が公開日時を過ぎた予約を 'published' へ自動昇格する。
-- 公開読み取りは status='published' のみを表示するため、予約中は非公開のまま。
--
-- 制約は定義から名前非依存で見つけて張り替える（既存名に依存しない）。
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.site_content_posts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%'
    AND pg_get_constraintdef(oid) ILIKE '%draft%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.site_content_posts DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.site_content_posts
  ADD CONSTRAINT site_content_posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'archived')) NOT VALID;

ALTER TABLE public.site_content_posts
  VALIDATE CONSTRAINT site_content_posts_status_check;
