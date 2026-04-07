-- Add missing columns to certificates table
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS customer_phone_last4      text,
  ADD COLUMN IF NOT EXISTS customer_phone_last4_hash text,
  ADD COLUMN IF NOT EXISTS template_id               uuid;
