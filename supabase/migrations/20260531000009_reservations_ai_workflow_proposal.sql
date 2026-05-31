-- reservations に AI ワークフロー「提案」の保存列を追加。
--
-- 背景: auto-action `workflow.auto_propose_on_intake` が opt-in されている
-- テナントでは、案件 (予約) 登録時にメニュー内容 + 顧客/車両の過去施工履歴から
-- 最適なワークフローテンプレートを AI が提案し、ここに保存する。案件画面はこの
-- 提案を「このフローで開始しますか?」として提示する。
--
-- スキーマ (jsonb):
--   {
--     "suggested_template_id":   uuid | null,
--     "suggested_template_name": text | null,
--     "service_type":            "coating|ppf|wrapping|body_repair|other" | null,
--     "reason":                  text,
--     "confidence":              number,
--     "ai":                      bool,
--     "auto":                    true,
--     "generated_at":            "YYYY-MM-DDTHH:mm:ssZ"
--   }
--
-- - nullable (NULL = 未提案 / auto OFF / 既に進行中 / テンプレート未登録)
-- - これは「提案」であって自動適用ではない。ワークフローの適用 (進行開始) は必ず
--   人が承認 (start-workflow) または別テンプレートに変更してから行う。

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_workflow_proposal jsonb;

COMMENT ON COLUMN reservations.ai_workflow_proposal IS
  'workflow.auto_propose_on_intake が生成したワークフロー提案 (suggested_template_id + reason + generated_at)。NULL = 未提案。適用 (進行開始) は必ず人が行う。';
