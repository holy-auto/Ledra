-- =============================================================================
-- LINE チャネルアクセストークンの有効期限を記録する
--
-- 背景: これまで加盟店には LINE Developers Console で「チャネルアクセストークン
--   （長期）」を自分で発行して貼り付けてもらっていた。長期トークンは無期限なので
--   期限の管理は不要だった。
--
--   今回、Channel ID と Channel Secret だけで Ledra 側がトークンを自動発行する
--   (`POST /v2/oauth/accessToken` の client_credentials) 方式に変えたため、
--   発行されるトークンは **30日で失効する**。放置すると 30 日後に予約通知・
--   リマインダー・書類送付が静かに全部止まる。
--
--   そこで失効時刻を保存し、送信直前に期限が近ければ自動で再発行する
--   (`src/lib/line/client.ts` の getLineConfig)。
--
-- NULL の意味: 「期限なし」。手入力の長期トークンで連携済みの既存テナントは
--   NULL のままで、再発行の対象外になる（挙動が変わらない）。
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS line_channel_token_expires_at timestamptz;

COMMENT ON COLUMN tenants.line_channel_token_expires_at IS
  'LINE チャネルアクセストークンの失効時刻。NULL は「期限なし」= 手入力の長期トークン（再発行しない）。値がある場合は期限が近づくと自動で再発行する。';
