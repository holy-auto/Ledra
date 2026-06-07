-- =============================================================
-- customer_inquiries: AI 自動分類カラム (inquiry.auto_classify)
--
-- 問い合わせ受信時 (POST /api/customer/inquiry) に、人の操作なしで
-- カテゴリ / 優先度 / 返信下書きを自動生成し、ここに保存する。
-- スタッフが受信箱を開いた瞬間に分類済み・下書き済みの状態にする
-- (返信の送信は必ず人が行う = 注釈・下書きのみ・壁3 不介入)。
--
-- すべて nullable で追加 (zero-downtime: NOT NULL DEFAULT を避ける)。
-- IF NOT EXISTS で再実行に耐える。既存 RLS ポリシーがそのまま適用される。
-- =============================================================

ALTER TABLE customer_inquiries
  ADD COLUMN IF NOT EXISTS ai_category      text,
  ADD COLUMN IF NOT EXISTS ai_priority      text,
  ADD COLUMN IF NOT EXISTS ai_draft_reply   text,
  ADD COLUMN IF NOT EXISTS ai_confidence    numeric(3,2),
  ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz;
