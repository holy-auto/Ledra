-- =============================================================
-- reservations.ai_next_action
--
-- 案件 (= reservation) の状態遷移時に自動算出する「次アクション提案」
-- (job.auto_next_action)。ステータス + 文脈 (顧客/車両/証明書/請求) から
-- pickJobNextActionCandidate (deterministic) + AI 文章化した結果を保存し、
-- 案件画面 (JobAiSuggestPanel) が即時表示できるようにする。
--
-- 既存の reservations.ai_* (ai_certificate_draft / ai_accounting_suggestion /
-- ai_workflow_proposal) と同じ「提案を先回りで持たせる」パターン。確定操作は人
-- (注釈・提案のみ・壁3 不介入)。
--
-- nullable で追加 (zero-downtime)。IF NOT EXISTS で再実行に耐える。
-- =============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_next_action jsonb;

COMMENT ON COLUMN reservations.ai_next_action IS
  'job.auto_next_action が状態遷移時に保存する次アクション提案 (action/message/priority/ai/status/source)。提案のみ・確定は人。';
