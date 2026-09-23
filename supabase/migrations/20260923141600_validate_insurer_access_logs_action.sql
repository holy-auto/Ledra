-- 20260923141500 で足した CHECK を検証する（既存行の確認）。
-- 広げる方向の変更なので、旧4値を満たしていた行はすべて新しい語彙も満たす。
-- 本番は2行（どちらも `search`）なので即座に終わる。
ALTER TABLE public.insurer_access_logs
  VALIDATE CONSTRAINT insurer_access_logs_action_check;
