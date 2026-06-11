-- LinkedIn 自動投稿のログ＆ローテーション管理テーブル
-- 毎日のcron（/api/cron/linkedin-posting）が、投稿コンテンツ配列を
-- 順番に1件ずつ投稿する。次に投稿すべきインデックスは
-- 「これまでに status='posted' となった件数 % 投稿数」で算出するため、
-- 専用の状態テーブルは持たず、このログテーブルだけで完結する。
CREATE TABLE IF NOT EXISTS marketing_linkedin_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 投稿コンテンツ配列(LINKEDIN_POSTS)内の0始まりインデックス
  post_index INT NOT NULL,
  -- 可読性のための1始まりの通し番号（コンテンツの day と一致）
  post_day INT NOT NULL,
  -- 'posted' | 'failed' | 'skipped'
  status TEXT NOT NULL CHECK (status IN ('posted', 'failed', 'skipped')),
  -- 投稿に成功した場合のLinkedIn投稿URN
  linkedin_urn TEXT,
  -- 失敗/スキップ時の理由
  error TEXT,
  -- 投稿した本文のスナップショット（後からコンテンツを編集しても履歴が残る）
  text_snapshot TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_linkedin_log_created
  ON marketing_linkedin_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_linkedin_log_status
  ON marketing_linkedin_log(status);

-- RLS: cron(service_role)のみが読み書きする運用データ。
-- 一般ユーザー向けの参照は不要なため SELECT ポリシーは付与しない。
ALTER TABLE marketing_linkedin_log ENABLE ROW LEVEL SECURITY;

-- service_role はRLSをバイパスするため明示ポリシーは不要だが、
-- 既存テーブルの慣習に合わせて INSERT ポリシーを定義しておく。
CREATE POLICY "Service role can insert linkedin log"
  ON marketing_linkedin_log FOR INSERT
  WITH CHECK (true);
