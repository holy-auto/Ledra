-- =============================================================
-- メール予約取り込み (Inbound Email → 予約抽出)
--
-- テナントごとの受信アドレス用トークンと有効フラグを tenants に追加する。
-- 受信アドレスは  yoyaku-<token>@<INBOUND_EMAIL_DOMAIN>。
-- SendGrid Inbound Parse 等からの Webhook で token → tenant を解決し、
-- 既存の受信メッセージ抽出 (customer_messages + maybeAutoProcessInboundMessage)
-- にそのまま合流させる。LINE と同じ複合認識・自動起票パスを再利用する。
-- =============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS email_inbound_token text,
  ADD COLUMN IF NOT EXISTS email_inbound_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.email_inbound_token IS
  'メール予約取り込みの受信アドレス用トークン。yoyaku-<token>@<domain> を構成。有効化時に生成。';
COMMENT ON COLUMN tenants.email_inbound_enabled IS
  'メール予約取り込みの有効フラグ (既定 false)。';

-- token による tenant 解決はクロステナント境界のため、128bit 乱数に加えて DB でも
-- 一意を担保する。tenants は小さい表なので index 構築の書き込みロックは軽微
-- (allowlist に登録済み)。
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_email_inbound_token
  ON tenants (email_inbound_token)
  WHERE email_inbound_token IS NOT NULL;
