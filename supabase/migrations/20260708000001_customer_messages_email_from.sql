-- =============================================================
-- メール受信スレッドキー: customer_messages.email_from
--
-- メール取り込みでは、初回送信者や転送元 (予約サイトの no-reply 等) は customers と
-- 紐付かないことが多い。customer_id / line_user_id のどちらも無い行は横断受信箱
-- (/api/admin/messages) のスレッド集約から漏れてスタッフに見えなくなるため、
-- 送信元アドレスをスレッドキー兼メタデータとして持たせる。
--
-- 注意: email_from は「顧客の同定」には使わない (転送メールの From は予約サイトの
-- no-reply であることが多く、顧客本人とは限らないため)。顧客同定は AI 抽出結果に委ねる。
-- =============================================================

ALTER TABLE customer_messages
  ADD COLUMN IF NOT EXISTS email_from text;

COMMENT ON COLUMN customer_messages.email_from IS
  'メール受信時の送信元アドレス。customer_id/line_user_id が無い場合のスレッドキー兼メタデータ。顧客同定には使わない。';

CREATE INDEX IF NOT EXISTS idx_customer_messages_thread_by_email
  ON customer_messages (tenant_id, email_from, created_at DESC)
  WHERE email_from IS NOT NULL;
