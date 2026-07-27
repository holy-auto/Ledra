-- =============================================================
-- reservations.ai_assignee_suggestion
--
-- 案件 (= reservation) の登録 (入庫) 時に自動算出する「担当メカニック候補提案」
-- (mechanic.auto_assign_suggest)。予約タイトル + メニューから必要スキルを推定し、
-- staff_members.skills とのマッチ + 過去の同種施工の担当履歴 (+ 必要時 AI) で
-- 担当者候補をランク付けして保存し、案件画面が即時表示できるようにする。
--
-- 既存の reservations.ai_* (ai_certificate_draft / ai_accounting_suggestion /
-- ai_workflow_proposal / ai_next_action) と同じ「提案を先回りで持たせる」パターン。
-- 割当 (確定) は人が行う (注釈・提案のみ・壁3 不介入)。保険案件の
-- insurer_case.auto_assign_suggest と同じく「提案のみ・自動割当しない」。
--
-- nullable で追加 (zero-downtime)。IF NOT EXISTS で再実行に耐える。
-- =============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_assignee_suggestion jsonb;

COMMENT ON COLUMN reservations.ai_assignee_suggestion IS
  'mechanic.auto_assign_suggest が入庫時に保存する担当メカニック候補 (candidates[{staff_id,name,score,method,reason}]/ai/service_type/generated_at)。提案のみ・割当確定は人。';
