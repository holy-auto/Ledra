-- intake 自動検証の結果を保持するカラム.
-- 自動承認が通った場合: 通常は NULL (= 問題なし)
-- 手動レビューが必要な場合: validation_issues に AI/ルール検証で検出された問題リストが入る

ALTER TABLE customer_intake_invitations
  ADD COLUMN IF NOT EXISTS validation_issues jsonb;

COMMENT ON COLUMN customer_intake_invitations.validation_issues IS
  '自動検証で検出された問題リスト. status=submitted で manual review 待ちのときに非 NULL.';

-- 自動承認 (approved_by IS NULL かつ status=completed) を素早く絞り込むためのインデックス
CREATE INDEX IF NOT EXISTS idx_intake_auto_approved
  ON customer_intake_invitations (tenant_id, completed_at DESC)
  WHERE status = 'completed' AND approved_by IS NULL;
