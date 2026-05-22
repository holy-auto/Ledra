-- =============================================================
-- Passport Verification API — Platform-level public API
--
-- Introduces an API-key-authenticated read endpoint at
-- `/api/v1/passport/verify` that lets third parties (used-car
-- dealers, buy-back shops, insurance assessors) look up the
-- public passport summary for a VIN they have a legitimate
-- interest in.
--
-- Differs from `tenant_api_keys` in that consumers are NOT
-- tenants of the platform — they're independent businesses
-- buying verification credits. Therefore a separate
-- `passport_api_consumers` table owns the keys.
--
-- The endpoint never returns PII (owner name/email, exact
-- service location). It returns the same aggregation that
-- `/v/[vin]` shows for free, plus structured metadata.
--
-- See: docs/vehicle-passport-design.md §7 (Verification API)
-- =============================================================

-- -------------------------------------------------------------
-- passport_api_consumers : independent businesses paying for API
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passport_api_consumers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  contact_email         text NOT NULL,
  status                text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),

  -- Soft quota / rate limit. Per-key enforcement is in app code
  -- (src/lib/passport/api/keys.ts) — the DB just records intent.
  monthly_quota         int NOT NULL DEFAULT 1000,
  rate_limit_per_minute int NOT NULL DEFAULT 60,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE passport_api_consumers IS
  'External businesses (non-tenants) authorized to call the public passport verification API.';

CREATE INDEX IF NOT EXISTS idx_passport_api_consumers_status
  ON passport_api_consumers (status)
  WHERE status = 'active';

-- -------------------------------------------------------------
-- passport_api_keys : hashed API keys per consumer
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passport_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id  uuid NOT NULL REFERENCES passport_api_consumers (id) ON DELETE CASCADE,
  name         text NOT NULL,

  -- First 12 chars of the raw key (`lpk_live_xxxx`). Safe to show
  -- in the consumer dashboard so they can identify which key is
  -- which without ever re-exposing the full secret.
  key_prefix   text NOT NULL,

  -- SHA-256(key + CUSTOMER_AUTH_PEPPER). Globally unique so a
  -- presented key resolves to at most one row.
  key_hash     text NOT NULL UNIQUE,

  scopes       text[] NOT NULL DEFAULT ARRAY['passport:verify']::text[],

  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN passport_api_keys.key_prefix IS
  'Public, non-secret identifier (first 12 chars of raw key). Safe to display.';
COMMENT ON COLUMN passport_api_keys.key_hash IS
  'SHA-256(key + CUSTOMER_AUTH_PEPPER) — never exposed via API.';

CREATE INDEX IF NOT EXISTS idx_passport_api_keys_consumer
  ON passport_api_keys (consumer_id)
  WHERE revoked_at IS NULL;

-- -------------------------------------------------------------
-- passport_api_call_logs : per-call audit + quota accounting
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passport_api_call_logs (
  id                     bigserial PRIMARY KEY,
  api_key_id             uuid REFERENCES passport_api_keys (id) ON DELETE SET NULL,
  consumer_id            uuid REFERENCES passport_api_consumers (id) ON DELETE SET NULL,
  endpoint               text NOT NULL,
  vin_queried_normalized text,
  response_status        int NOT NULL,
  response_time_ms       int,
  -- SHA-256 hash of the caller IP. We don't store raw IPs to
  -- minimize PII surface; the hash is still useful for
  -- correlation across calls.
  ip_hash                text,
  user_agent             text,
  called_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE passport_api_call_logs IS
  'Per-call audit log for the public passport verification API. Used for billing reconciliation and abuse investigation.';

CREATE INDEX IF NOT EXISTS idx_passport_api_logs_consumer_time
  ON passport_api_call_logs (consumer_id, called_at DESC)
  WHERE consumer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_passport_api_logs_key_time
  ON passport_api_call_logs (api_key_id, called_at DESC)
  WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_passport_api_logs_vin
  ON passport_api_call_logs (vin_queried_normalized)
  WHERE vin_queried_normalized IS NOT NULL;

-- -------------------------------------------------------------
-- RLS — all three tables: service role only.
--
-- Consumers don't authenticate against Supabase Auth (no user
-- account in the platform); they authenticate via raw API keys
-- in `Authorization: Bearer lpk_live_...`. All access goes
-- through server-side handlers using the service-role client.
-- Future operator UI will gate on platform-admin role.
-- -------------------------------------------------------------
ALTER TABLE passport_api_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_api_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passport_api_consumers_service_role" ON passport_api_consumers;
CREATE POLICY "passport_api_consumers_service_role"
  ON passport_api_consumers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "passport_api_keys_service_role" ON passport_api_keys;
CREATE POLICY "passport_api_keys_service_role"
  ON passport_api_keys
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "passport_api_call_logs_service_role" ON passport_api_call_logs;
CREATE POLICY "passport_api_call_logs_service_role"
  ON passport_api_call_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at auto-touch
DROP TRIGGER IF EXISTS trg_passport_api_consumers_touch ON passport_api_consumers;
CREATE TRIGGER trg_passport_api_consumers_touch
  BEFORE UPDATE ON passport_api_consumers
  FOR EACH ROW
  EXECUTE FUNCTION touch_vehicle_passports_updated_at();

DROP TRIGGER IF EXISTS trg_passport_api_keys_touch ON passport_api_keys;
CREATE TRIGGER trg_passport_api_keys_touch
  BEFORE UPDATE ON passport_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION touch_vehicle_passports_updated_at();
