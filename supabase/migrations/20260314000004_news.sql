-- ニュース記事の永続保存テーブル
CREATE TABLE IF NOT EXISTS saved_news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  keywords TEXT[] DEFAULT '{}',
  is_relevant BOOLEAN DEFAULT true,
  UNIQUE(url)
);

CREATE INDEX idx_saved_news_published ON saved_news(published_at DESC);
CREATE INDEX idx_saved_news_category ON saved_news(category);

-- RLS
ALTER TABLE saved_news ENABLE ROW LEVEL SECURITY;

-- 認証ユーザーは閲覧可能
CREATE POLICY "Authenticated users can read news"
  ON saved_news FOR SELECT
  TO authenticated
  USING (true);

-- service_role のみ挿入可（cron API用）
CREATE POLICY "Service role can insert news"
  ON saved_news FOR INSERT
  WITH CHECK (true);
