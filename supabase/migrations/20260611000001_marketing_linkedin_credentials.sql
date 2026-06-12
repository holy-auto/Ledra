-- LinkedIn 自動投稿のOAuthトークン保管（シングルトン行）
-- 自社の1ページに投稿するだけなので、テナント別ではなく単一行で管理する。
-- アクセストークン/リフレッシュトークンは既存の暗号化方式
-- (AES-256-GCM, secretBox の envelope 形式) で _ciphertext 列に保存する。
-- cron が期限切れ間近を検知したら refresh_token で更新し、この行に書き戻す。
CREATE TABLE IF NOT EXISTS marketing_linkedin_credentials (
  -- シングルトン: 常に 'default' の1行のみ
  id TEXT PRIMARY KEY DEFAULT 'default',
  -- 暗号化済みトークン（secretBox envelope: v1.<iv>.<ciphertext>）
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  -- アクセストークンの有効期限（ISO8601 / timestamptz）
  token_expires_at TIMESTAMPTZ,
  -- 投稿主URN（urn:li:organization:... など）。未設定なら env を使う
  author_urn TEXT,
  -- 最終リフレッシュ日時（監視用）
  last_refreshed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT marketing_linkedin_credentials_singleton CHECK (id = 'default')
);

-- RLS: cron(service_role)のみが読み書きする秘匿データ。
-- 一般ユーザーには一切公開しない（SELECTポリシーを付与しない）。
ALTER TABLE marketing_linkedin_credentials ENABLE ROW LEVEL SECURITY;
