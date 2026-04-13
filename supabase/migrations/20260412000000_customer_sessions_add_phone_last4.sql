-- Add phone_last4 column to customer_sessions for legacy certificate backward-compat.
--
-- Background: certificates uploaded before phone-hash migration have
-- customer_phone_last4 (plain) but no customer_phone_last4_hash.
-- Storing the plain last4 in the session lets the list API find those
-- legacy records via the OR-query in listCertificatesForCustomer().

ALTER TABLE customer_sessions
  ADD COLUMN IF NOT EXISTS phone_last4 TEXT DEFAULT NULL;

COMMENT ON COLUMN customer_sessions.phone_last4 IS
  'Plain phone last-4 digits, stored only when the user authenticated with
   a legacy certificate that has no customer_phone_last4_hash. Used for
   backward-compat lookups. NULL for all new sessions.';
