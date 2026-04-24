-- =============================================================
-- Customer Portal: bind sessions to customer_id (Phase 2)
-- Motivation:
--   The original design scopes queries by (tenant_id, phone_last4_hash,
--   email) which has a small collision risk when two customers in the same
--   tenant share the last 4 digits of a phone number. The email filter in
--   application code is a defense layer but not a proper fix.
--
--   This migration adds `customer_id` (nullable) to `customer_sessions`.
--   When a session is created with enough context to resolve a single
--   customer_id from the certs table, that id is baked into the session.
--   Queries can then scope by customer_id directly, eliminating the
--   collision window.
--
--   Sessions created before this column existed remain at customer_id=null
--   and continue to use the phone_hash + email fallback path. No backfill
--   is performed — existing sessions stay on the fallback path until the
--   customer logs in again.
-- =============================================================

ALTER TABLE customer_sessions
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- Partial index: only index rows with a customer_id (keeps the index small
-- during the migration period when most rows are null).
CREATE INDEX IF NOT EXISTS idx_customer_sessions_tenant_customer
  ON customer_sessions (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

COMMENT ON COLUMN customer_sessions.customer_id IS
  'Resolved customer identity for this session. NULL for sessions predating the migration or when resolution was ambiguous; callers fall back to (phone_last4_hash, email) scoping in that case.';
