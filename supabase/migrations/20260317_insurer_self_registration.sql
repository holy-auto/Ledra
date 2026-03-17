-- ==========================================
-- 加盟店セルフ登録機能 DB変更
-- ==========================================

-- 1. insurers テーブルにカラム追加
-- status: 仮開通 / 正式 / 停止
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- CHECK制約（既存制約がなければ追加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurers_status_check'
  ) THEN
    ALTER TABLE insurers ADD CONSTRAINT insurers_status_check
      CHECK (status IN ('active_pending_review', 'active', 'suspended'));
  END IF;
END $$;

-- 加盟店が登録時に選択したプラン（希望値）
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS requested_plan text;

-- 連絡先情報（登録フォームから入力）
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS contact_phone text;

-- 審査・管理関連
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE insurers ADD COLUMN IF NOT EXISTS signup_source text DEFAULT 'manual';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_insurers_status ON insurers (status);

-- 2. ステータス取得用RPC（新規追加）
CREATE OR REPLACE FUNCTION get_my_insurer_status()
RETURNS TABLE(insurer_id uuid, status text, plan_tier text, requested_plan text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT i.id, i.status, i.plan_tier, i.requested_plan
  FROM public.insurers i
  JOIN public.insurer_users iu ON iu.insurer_id = i.id
  WHERE iu.user_id = auth.uid()
    AND iu.is_active = true
  LIMIT 1;
$$;
