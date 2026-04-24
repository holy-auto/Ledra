-- ============================================================
-- サイト（HP）向けコンテンツ投稿テーブル
-- スタッフが作成するブログ・イベント・ウェビナーを統一管理
-- ============================================================

CREATE TABLE IF NOT EXISTS site_content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,

  -- 種別
  type text NOT NULL
    CHECK (type IN ('blog', 'event', 'webinar')),

  -- 公開制御
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,

  -- 基本情報
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text,
  body text NOT NULL DEFAULT '',
  hero_image_url text,
  tags text[] NOT NULL DEFAULT '{}',
  author text,

  -- イベント・ウェビナー固有（blog では NULL）
  event_start_at timestamptz,
  event_end_at timestamptz,
  location text,
  online_url text,
  capacity integer,
  registration_url text,

  -- メタ
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (type, slug)
);

CREATE INDEX IF NOT EXISTS idx_site_content_posts_type_status
  ON site_content_posts (type, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_content_posts_tenant
  ON site_content_posts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_content_posts_event_start
  ON site_content_posts (event_start_at)
  WHERE type IN ('event', 'webinar');

-- RLS
ALTER TABLE site_content_posts ENABLE ROW LEVEL SECURITY;

-- 公開済みは誰でも閲覧可能（HP表示用）
CREATE POLICY "site_content_posts_select_published" ON site_content_posts
  FOR SELECT
  USING (status = 'published');

-- 認証済みユーザーは所属テナントの全投稿を閲覧可能
CREATE POLICY "site_content_posts_select_own_tenant" ON site_content_posts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- 認証済みユーザーは自テナントに投稿を作成可能（アプリ側で role チェックを併用）
CREATE POLICY "site_content_posts_insert_own_tenant" ON site_content_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "site_content_posts_update_own_tenant" ON site_content_posts
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "site_content_posts_delete_own_tenant" ON site_content_posts
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION set_site_content_posts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_content_posts_updated_at ON site_content_posts;
CREATE TRIGGER trg_site_content_posts_updated_at
  BEFORE UPDATE ON site_content_posts
  FOR EACH ROW
  EXECUTE FUNCTION set_site_content_posts_updated_at();
