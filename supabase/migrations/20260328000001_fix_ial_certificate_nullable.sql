-- Fix: insurer_access_logs.certificate_id should be nullable
-- Search actions don't have a certificate_id
ALTER TABLE insurer_access_logs ALTER COLUMN certificate_id DROP NOT NULL;
