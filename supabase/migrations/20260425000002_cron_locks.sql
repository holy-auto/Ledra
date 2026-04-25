-- ============================================================
-- cron_locks: cron が同時多重起動した場合の重複処理を防ぐための
-- 短命な分散ロック。
-- 取得は acquire_cron_lock(task, ttl_seconds) RPC で原子的に行う。
-- expires_at 経過後は別 cron が奪取できる (cron が落ちて DELETE
-- されないケースの自己修復)。
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_locks (
  task text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- INSERT または期限切れであれば奪取。RETURN true なら取得成功。
-- ON CONFLICT ... DO UPDATE WHERE で「期限切れのときだけ UPDATE」を
-- 一発で表現することで、check-then-set のレースを排除する。
CREATE OR REPLACE FUNCTION acquire_cron_lock(p_task text, p_ttl_seconds int)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  affected int;
BEGIN
  INSERT INTO cron_locks (task, acquired_at, expires_at)
  VALUES (p_task, now(), now() + (p_ttl_seconds::text || ' seconds')::interval)
  ON CONFLICT (task) DO UPDATE
    SET acquired_at = EXCLUDED.acquired_at,
        expires_at = EXCLUDED.expires_at
    WHERE cron_locks.expires_at < now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION release_cron_lock(p_task text)
RETURNS void
LANGUAGE sql
AS $$ DELETE FROM cron_locks WHERE task = p_task $$;

-- RLS: 他テナントから一切触れないようにする (Service Role のみ使用)
ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;
-- ポリシーを敢えて付けず、Service Role 以外は空集合となる。
