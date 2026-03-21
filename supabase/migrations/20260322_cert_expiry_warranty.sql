-- Add expiry date and warranty period end to certificates
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS warranty_period_end date;
