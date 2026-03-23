-- ============================================================
-- 運営お知らせ（Announcements）マイグレーション
-- システム管理者からユーザーへのお知らせ通知機能
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- お知らせ内容
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'info'
    CHECK (category IN ('info', 'update', 'maintenance', 'important')),

  -- 公開制御
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  expires_at timestamptz,

  -- メタ
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: 全ユーザーが公開済みお知らせを閲覧可能
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select_published" ON announcements
  FOR SELECT USING (
    published = true
    AND (expires_at IS NULL OR expires_at > now())
  );

-- 既読管理テーブル
CREATE TABLE IF NOT EXISTS announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcement_reads_select_own" ON announcement_reads
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "announcement_reads_insert_own" ON announcement_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_announcements_published ON announcements(published, published_at DESC)
  WHERE published = true;
CREATE INDEX idx_announcement_reads_user ON announcement_reads(user_id, announcement_id);
