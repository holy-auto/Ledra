-- =============================================================
-- Reservation work timer columns
-- 案件 (reservation) の実作業時間を自動計測するための列追加。
-- status が in_progress に遷移したタイミングで work_started_at を、
-- completed に遷移したタイミングで work_completed_at を自動セットする
-- (アプリ側 PUT ハンドラで実装)。差分から実作業分数を算出して
-- スタッフ稼働 / 原価分析の元データにする。
--
-- 既存 reservation_step_logs はワークフロー各ステップ単位、
-- 本カラムは案件全体としての作業時間。重複ではなく粒度の違い。
-- =============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS work_started_at timestamptz;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS work_completed_at timestamptz;

COMMENT ON COLUMN reservations.work_started_at IS
  'status が in_progress に遷移したタイミングを自動記録 (PUT /api/admin/reservations)';
COMMENT ON COLUMN reservations.work_completed_at IS
  'status が completed に遷移したタイミングを自動記録 (PUT /api/admin/reservations)';

CREATE INDEX IF NOT EXISTS idx_reservations_work_started_at
  ON reservations (tenant_id, work_started_at DESC)
  WHERE work_started_at IS NOT NULL;
