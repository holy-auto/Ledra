-- テナント別の AI 月次コスト上限 (コストキャップ)。
--
-- 当月の AI 概算コスト (Redis カウンタ ai-cost:<tenant>:<YYYY-MM>) がこの値を超えると、
-- loadAiAutomationSettings が enabled=false 相当に倒して以降の AI 呼び出しを一時停止する
-- (= 暴走課金の安全ブレーキ)。NULL = テナント個別上限なし → env AI_MONTHLY_COST_CAP_JPY に従う。
--
-- 既存行の挙動は変えない (NULL デフォルト = 従来どおり上限なし)。
-- 列が未作成の環境でも policy.ts 側は missing-column を握りつぶして従来動作にフォールバックする。

ALTER TABLE tenant_ai_automation_settings
  ADD COLUMN IF NOT EXISTS monthly_cost_cap_jpy integer
    CHECK (monthly_cost_cap_jpy IS NULL OR monthly_cost_cap_jpy >= 0);

COMMENT ON COLUMN tenant_ai_automation_settings.monthly_cost_cap_jpy IS
  'テナント別の AI 月次コスト上限 (円・概算)。当月概算コストが超過すると AI を一時停止。NULL = env 既定に従う。';
