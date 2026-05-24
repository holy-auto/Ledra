-- Cron 連続失敗の追跡テーブル (G5/G6/G7 共通基盤)
--
-- 各 cron が成功すれば consecutive_failures をゼロリセット、失敗すれば
-- インクリメントする。threshold 超過時に運営にメール通知 (last_alert_at で
-- 再通知を抑制)。
--
-- 対象 cron 例:
--   polygon-signer  : Polygon 本番 anchor 連続失敗 (RPC エラー / 残高不足等)
--   square-sync     : Square OAuth token 失効 / API 5xx
--   accounting-sync : freee / MF の OAuth 失効 / API 5xx
--
-- 関連: docs/operations/external-dependency-matrix.md §4 G5, G6, G7
--
-- 設計判断:
-- - 既存の cron_locks とは別テーブル (lock は短命、failure streak は永続)
-- - PK は task name (cron 名と一致、人間が読める)
-- - failure_count は monitoring 用 (アラート抑制ロジックに使う)

CREATE TABLE IF NOT EXISTS public.cron_failure_streaks (
  task              text         PRIMARY KEY,
  consecutive_failures integer   NOT NULL DEFAULT 0,
  last_failure_at   timestamptz,
  last_success_at   timestamptz,
  last_alert_at     timestamptz,
  last_error        text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_failure_streaks IS
  'Cron 連続失敗カウンタ。threshold 超でアラート通知 (G5/G6/G7)。';

-- RLS: service_role のみアクセス (cron は service-role 経由のみ)
ALTER TABLE public.cron_failure_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_failure_streaks_service_role_all ON public.cron_failure_streaks;
CREATE POLICY cron_failure_streaks_service_role_all ON public.cron_failure_streaks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
