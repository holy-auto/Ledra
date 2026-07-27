-- ============================================================
-- Tighten market_inquiries / market_inquiry_messages RLS
--
-- Before: INSERT was open to anyone (WITH CHECK true), so a
-- caller holding only NEXT_PUBLIC_SUPABASE_ANON_KEY could POST
-- directly to the Supabase REST endpoint and bypass the rate
-- limit / validation enforced in /api/market/inquiries/route.ts.
--
-- After: INSERT is service-role only. The public API surface
-- (createAdminClient bypasses RLS) is unaffected, but anon /
-- authenticated users can no longer write directly.
--
-- Also add CHECK constraints to bound payload sizes and
-- require a plausible email shape.
-- ============================================================

DROP POLICY IF EXISTS "anyone can create inquiry" ON market_inquiries;
DROP POLICY IF EXISTS "anyone can create messages" ON market_inquiry_messages;

-- Bounded payloads so a compromised API route cannot store
-- multi-MB blobs. 2000 chars is ~enough for a long inquiry.
ALTER TABLE market_inquiries
  DROP CONSTRAINT IF EXISTS market_inquiries_message_length;
ALTER TABLE market_inquiries
  ADD CONSTRAINT market_inquiries_message_length
  CHECK (char_length(message) <= 2000);

ALTER TABLE market_inquiries
  DROP CONSTRAINT IF EXISTS market_inquiries_buyer_email_format;
ALTER TABLE market_inquiries
  ADD CONSTRAINT market_inquiries_buyer_email_format
  CHECK (buyer_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

ALTER TABLE market_inquiries
  DROP CONSTRAINT IF EXISTS market_inquiries_buyer_name_length;
ALTER TABLE market_inquiries
  ADD CONSTRAINT market_inquiries_buyer_name_length
  CHECK (char_length(buyer_name) BETWEEN 1 AND 200);

ALTER TABLE market_inquiry_messages
  DROP CONSTRAINT IF EXISTS market_inquiry_messages_length;
ALTER TABLE market_inquiry_messages
  ADD CONSTRAINT market_inquiry_messages_length
  CHECK (char_length(message) <= 2000);
