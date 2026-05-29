-- AI 利用ログ: 全 AI コールを 1 行 1 record で記録する集計テーブル。
--
-- 用途:
--   1. テナント別の月間 Anthropic 利用料 (input_tokens × $/M + output_tokens × $/M) 集計
--   2. confidence ヒストグラム (しきい値の妥当性判定)
--   3. 401/403/429 等のエラー頻度監視
--   4. プラットフォーム運営ダッシュボードでの利用状況可視化
--
-- 書き込みは AI ルートの末尾で fire-and-forget。失敗しても本処理は止めない。
-- 永続化先は単一テーブル (パーティショニング不要、12 ヶ月で十分なボリューム)。
--
-- 90 日経過分は `data-retention` cron が削除する想定 (詳細ログは保持しない方針)。

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
  -- insurer ルート用。tenant_id と排他で片方だけセット。
  insurer_id      uuid REFERENCES insurers(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint        text NOT NULL,
  model           text,
  -- "ok" / "ai_disabled" / "plan_limit" / "rate_limit" / "error" / "schema_error"
  outcome         text NOT NULL,
  input_tokens    integer,
  output_tokens   integer,
  /** AI 自己評価値 (0..1)、ある場合のみ。confidence ヒストグラム用 */
  confidence      numeric(3, 2),
  /** ms 単位の処理時間 (ルート全体ではなく AI コール部分のみ理想) */
  latency_ms      integer,
  /** 任意の補助情報 (policy 状態 / source 利用 / fallback 理由 等) */
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_usage_logs IS
  'AI ルートのコール毎ログ。tenant_id か insurer_id のどちらか必須。outcome / model / confidence / token 数を 1 行 1 record で記録。';
COMMENT ON COLUMN ai_usage_logs.outcome IS
  'ok | ai_disabled | plan_limit | rate_limit | error | schema_error';

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON ai_usage_logs (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_insurer ON ai_usage_logs (insurer_id, created_at DESC)
  WHERE insurer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_endpoint ON ai_usage_logs (endpoint, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- テナントは自分のログを読める
DROP POLICY IF EXISTS ai_usage_logs_select_tenant ON ai_usage_logs;
CREATE POLICY ai_usage_logs_select_tenant ON ai_usage_logs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

-- 保険会社も自分のログを読める
DROP POLICY IF EXISTS ai_usage_logs_select_insurer ON ai_usage_logs;
CREATE POLICY ai_usage_logs_select_insurer ON ai_usage_logs
  FOR SELECT USING (insurer_id IN (SELECT my_insurer_ids()));

-- データクリーンアップ: 90 日経過は削除対象 (data-retention cron 実装側でも 90 日基準を用いる想定)
COMMENT ON INDEX idx_ai_usage_tenant IS
  'テナント別の集計クエリ用。90 日経過のものは data-retention cron で削除される予定。';
