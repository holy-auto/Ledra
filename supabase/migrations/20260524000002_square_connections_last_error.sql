-- Square OAuth 401 (token 失効) の検出と UI 表示用カラム (G6)
--
-- square_connections.status は既存で 'error' を取れるが、原因が分からない
-- ので「再認可してください」と具体的なバナーを出せない。last_error_reason /
-- last_error_at で原因と発生時刻を保持し、管理画面で表示する。
--
-- 関連: docs/operations/external-dependency-matrix.md §4 G6

ALTER TABLE public.square_connections
  ADD COLUMN IF NOT EXISTS last_error_reason text,
  ADD COLUMN IF NOT EXISTS last_error_at     timestamptz;

COMMENT ON COLUMN public.square_connections.last_error_reason IS
  'token_expired / unauthorized / rate_limited 等。status="error" 時に管理画面でバナー表示する根拠';
COMMENT ON COLUMN public.square_connections.last_error_at IS
  '直近のエラー検出時刻。status="error" の発生から経過時間を UI で示す';
