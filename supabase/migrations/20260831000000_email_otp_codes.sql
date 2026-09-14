-- =============================================================================
-- IMP-012: メール OTP コード保存テーブル（汎用エンジンの IO 層）。
--
-- src/lib/auth/otp.ts（IMP-012 で追加した生成・ハッシュ・検証の純関数エンジン）は
-- 実データ保存先を持たず、呼び出し側が用意する設計だった。最初の利用箇所は
-- モバイルアプリのサインアップ後メール確認（purpose = 'mobile_signup'）。
-- 既存の customer_login_codes（顧客ポータル、電話下4桁ハッシュと密結合）とは
-- 別テーブルとし、汎用モジュールとして招待検証等への拡張を妨げない。
--
-- customer_login_codes / customer_sessions と同じ設計: service role 経由のみ
-- 読み書き可能（RLS はクライアントからの直接アクセスを常に拒否）。
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  email       text NOT NULL,
  purpose     text NOT NULL DEFAULT 'mobile_signup' CHECK (purpose IN ('mobile_signup')),
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_otp_codes ENABLE ROW LEVEL SECURITY;

-- Service role only (no direct user access) — customer_login_codes と同じ方針。
CREATE POLICY "email_otp_codes_service_only" ON email_otp_codes
  FOR ALL
  USING (false);

-- 直近の有効コードを (tenant_id, user_id, purpose) で引く経路の高速化。
CREATE INDEX IF NOT EXISTS idx_email_otp_codes_lookup
  ON email_otp_codes (tenant_id, user_id, purpose, created_at DESC);
