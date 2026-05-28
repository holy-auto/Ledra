-- 事前カルテ intake を「顧客が送信 → 店舗が確認 → 正規登録」の 2 段階フローへ拡張.
--
-- 既存: pending → completed (customers 作成と同時)
-- 新規: pending → submitted (顧客送信、データ保持) → completed (店舗が承認 → customers 作成)
--
-- 既に completed 済みのレコードは触らない (歴史データ).

-- 1) submitted ステータスを CHECK 制約に追加
ALTER TABLE customer_intake_invitations
  DROP CONSTRAINT IF EXISTS customer_intake_invitations_status_check;

ALTER TABLE customer_intake_invitations
  ADD CONSTRAINT customer_intake_invitations_status_check
  CHECK (status IN ('pending', 'submitted', 'completed', 'revoked', 'expired'));

-- 2) 顧客が送信した内容を保持するカラム (承認後 customers にコピー)
ALTER TABLE customer_intake_invitations
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_name text,
  ADD COLUMN IF NOT EXISTS submitted_name_kana text,
  ADD COLUMN IF NOT EXISTS submitted_email text,
  ADD COLUMN IF NOT EXISTS submitted_phone text,
  ADD COLUMN IF NOT EXISTS submitted_postal_code text,
  ADD COLUMN IF NOT EXISTS submitted_address text,
  ADD COLUMN IF NOT EXISTS submitted_birth_date date,
  ADD COLUMN IF NOT EXISTS submitted_note text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3) 提出された個人番号 (12 桁) は CHECK 制約で混入防止
ALTER TABLE customer_intake_invitations
  ADD CONSTRAINT submitted_no_mynumber CHECK (
    (submitted_note IS NULL OR submitted_note !~ '^\d{12}$')
    AND (submitted_name IS NULL OR submitted_name !~ '\d{12}')
    AND (submitted_address IS NULL OR submitted_address !~ '\d{12}')
  );

-- 4) submitted ステータスで店舗が確認するためのインデックス
CREATE INDEX IF NOT EXISTS idx_intake_tenant_submitted
  ON customer_intake_invitations (tenant_id, submitted_at DESC)
  WHERE status = 'submitted';

COMMENT ON COLUMN customer_intake_invitations.submitted_at IS
  '顧客が intake フォームを送信した日時. status=submitted のときに非 NULL.';
COMMENT ON COLUMN customer_intake_invitations.approved_at IS
  '店舗が承認して customers レコードを作成した日時. status=completed のときに非 NULL.';
COMMENT ON COLUMN customer_intake_invitations.approved_by IS
  '承認操作を行った tenant ユーザ. auth.users.id.';
