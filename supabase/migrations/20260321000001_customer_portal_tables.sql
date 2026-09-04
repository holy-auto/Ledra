-- =============================================================
-- Customer Portal tables: OTP login codes and sessions
-- Used by customerPortalServer.ts for customer authentication
-- =============================================================

-- ─── customer_login_codes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_login_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email           text NOT NULL,
  phone_last4_hash text NOT NULL,
  code_hash       text NOT NULL,
  attempts        integer NOT NULL DEFAULT 0,
  used_at         timestamptz,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_login_codes ENABLE ROW LEVEL SECURITY;

-- Service role only (no direct user access)
CREATE POLICY "customer_login_codes_service_only" ON customer_login_codes
  FOR ALL
  USING (false);

-- Index for lookup by tenant + email + expiry (matching existing performance index)
CREATE INDEX IF NOT EXISTS idx_customer_login_codes_tenant_email
  ON customer_login_codes (tenant_id, email, expires_at DESC);

-- ─── customer_sessions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email           text NOT NULL,
  phone_last4_hash text NOT NULL,
  phone_last4_plain text,
  session_hash    text NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- Service role only (no direct user access)
CREATE POLICY "customer_sessions_service_only" ON customer_sessions
  FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_tenant_hash
  ON customer_sessions (tenant_id, session_hash);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires
  ON customer_sessions (expires_at)
  WHERE revoked_at IS NULL;


-- 【後から追記】20260318000000 が張るはずだった索引を、customer_login_codes が
-- 出来たこの位置で張る。あちらはファイル名の日付がこのファイルより前で、空 DB では
-- テーブルがまだ無い。新しいファイルは作らない（out-of-order で db push が止まる）。
-- 本番では既にあるので no-op。CONCURRENTLY は付けない（再適用されず、空 DB では空）。
CREATE INDEX IF NOT EXISTS idx_customer_login_codes_tenant_email
  ON public.customer_login_codes (tenant_id, email, expires_at DESC);
