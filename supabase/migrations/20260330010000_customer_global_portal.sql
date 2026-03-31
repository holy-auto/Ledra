-- =============================================================
-- Customer Global Portal tables: OTP login codes and sessions
-- Used by customerPortalGlobal.ts for cross-tenant customer access
-- =============================================================

-- ─── customer_global_login_codes ──────────────────────────────
CREATE TABLE IF NOT EXISTS customer_global_login_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  phone_last4  text NOT NULL,
  code_hash    text NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  used_at      timestamptz,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_global_login_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_global_login_codes_service_only" ON customer_global_login_codes
  FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_customer_global_login_codes_email_phone_expiry
  ON customer_global_login_codes (email, phone_last4, expires_at DESC);

-- ─── customer_global_sessions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_global_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_hash text NOT NULL,
  email         text NOT NULL,
  phone_last4   text NOT NULL,
  session_hash  text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_global_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_global_sessions_service_only" ON customer_global_sessions
  FOR ALL
  USING (false);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_global_sessions_hash
  ON customer_global_sessions (session_hash);

CREATE INDEX IF NOT EXISTS idx_customer_global_sessions_identity
  ON customer_global_sessions (identity_hash, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_global_sessions_expires
  ON customer_global_sessions (expires_at)
  WHERE revoked_at IS NULL;
