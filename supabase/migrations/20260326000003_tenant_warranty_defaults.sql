-- Add default warranty exclusions column to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_warranty_exclusions text;
