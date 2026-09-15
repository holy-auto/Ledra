-- ============================================================
-- site_content_posts を「3サイト共通の投稿テーブル」にする。
--
-- 管理画面（/admin/site-content）から Ledra 自身だけでなく、
-- holy-inc.jp と mobilewash.app にも投稿できるようにする。外部2サイトは
-- 静的サイトなので、公開時にアプリが md ファイルを各リポジトリへコミットし、
-- Vercel の自動デプロイで反映される（src/lib/marketing/externalSites.ts）。
--
-- 追加する列:
--   site       — 投稿先。既存行はすべて Ledra なので DEFAULT 'ledra'
--   category   — 外部サイトの md frontmatter に出す分類（Ledra では未使用）
--   title_en   — holy-inc は日英2言語なので英語見出しが要る（他サイトでは未使用）
--
-- type に 'press'（MobileWash のプレスリリース）を追加する。Ledra 自身の
-- 公開ページは type を明示指定して読むので、増えても影響しない。
--
-- UNIQUE(type, slug) は UNIQUE(site, type, slug) に張り替える。
-- 別サイトの同名スラッグ（例: 3サイトの "company-news"）を許すため。
--
-- 値を広げるだけ・既存行は全て充足するので、CHECK は NOT VALID → VALIDATE。
-- ============================================================

ALTER TABLE public.site_content_posts
  ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT 'ledra',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS title_en text;

-- site の CHECK（再実行できるよう、あれば落としてから張る）
ALTER TABLE public.site_content_posts
  DROP CONSTRAINT IF EXISTS site_content_posts_site_check;

ALTER TABLE public.site_content_posts
  ADD CONSTRAINT site_content_posts_site_check
  CHECK (site IN ('ledra', 'holy-inc', 'mobilewash')) NOT VALID;

ALTER TABLE public.site_content_posts
  VALIDATE CONSTRAINT site_content_posts_site_check;

-- type に 'press' を追加。名前ではなく定義内容で既存 CHECK を特定して落とす
-- （20260721100001 と同じ手口。環境差で制約名がずれても確実に落とすため）。
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
  CHECK (type IN ('blog', 'news', 'press', 'event', 'webinar')) NOT VALID;

ALTER TABLE public.site_content_posts
  VALIDATE CONSTRAINT site_content_posts_type_check;

-- UNIQUE(type, slug) → UNIQUE(site, type, slug)
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.site_content_posts'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (type, slug)';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.site_content_posts DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.site_content_posts
  DROP CONSTRAINT IF EXISTS site_content_posts_site_type_slug_key;

ALTER TABLE public.site_content_posts
  ADD CONSTRAINT site_content_posts_site_type_slug_key UNIQUE (site, type, slug);

-- 公開読み取りは site='ledra' で絞るので、索引の先頭に site を足す
CREATE INDEX IF NOT EXISTS idx_site_content_posts_site_type_status
  ON public.site_content_posts (site, type, status, published_at DESC);

DROP INDEX IF EXISTS public.idx_site_content_posts_type_status;

COMMENT ON COLUMN public.site_content_posts.site IS
  '投稿先サイト。ledra = 自サイト。holy-inc / mobilewash は公開時に md をリポジトリへコミットする';
COMMENT ON COLUMN public.site_content_posts.category IS
  '外部サイトの md frontmatter に出す分類。Ledra 自身の投稿では未使用';
COMMENT ON COLUMN public.site_content_posts.title_en IS
  'holy-inc（日英2言語）の英語見出し。他サイトでは未使用';
