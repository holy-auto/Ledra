-- signature_reviews に AI 自動解析 (review.auto_analyze) の結果列を追加。
--
-- 背景: 受領サイン後の顧客レビュー (signature_reviews) は star + 任意コメントを
-- 持つ。auto-action `review.auto_analyze` が opt-in されているテナントでは、
-- レビュー受信時に analyzeReviewSentiment を自動実行し、その結果をここに保存する。
-- これにより、スタッフが 1 件ずつ「AI 解析」を押さなくても、ネガティブ/要対応の
-- レビューを即トリアージできる。
--
-- - すべて nullable (NULL = 未解析 / コメント無し / auto OFF)
-- - 注釈用途であり、金額・本人確認・法的確定には一切関与しない (壁3 対象外)
-- - 解析は service-role の fire-and-forget で書く (公開 token フローに auth が無い)

ALTER TABLE signature_reviews
  ADD COLUMN IF NOT EXISTS ai_sentiment   text,
  ADD COLUMN IF NOT EXISTS ai_summary     text,
  ADD COLUMN IF NOT EXISTS ai_topics      jsonb,
  ADD COLUMN IF NOT EXISTS ai_actionable  boolean,
  ADD COLUMN IF NOT EXISTS ai_confidence  numeric(3, 2),
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

COMMENT ON COLUMN signature_reviews.ai_sentiment IS
  'AI 自動解析 (review.auto_analyze) のセンチメント: positive / neutral / negative。NULL = 未解析。';
COMMENT ON COLUMN signature_reviews.ai_actionable IS
  '店舗が改善できる具体的指摘を含むか (negative トリアージ用)。';

-- NOTE: 要対応レビュー (ai_actionable=true) の絞り込み用インデックスは、
-- CONCURRENTLY 必須 (lint-migrations) のため別マイグレーションで必要時に追加する。
-- 現状は signature_reviews(tenant_id, created_at) インデックスで十分。
