-- =============================================================
-- vehicle_passports — owner-email lookup index (CONCURRENTLY)
--
-- Companion to 20260522000000 (passport ownership transfers).
-- Split into its own file because CREATE INDEX CONCURRENTLY
-- cannot run inside a transaction; vehicle_passports is the
-- live aggregation table read on every /v/[vin] hit, so a
-- blocking lock during index creation would briefly stall the
-- public passport page.
-- =============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicle_passports_current_owner_email
  ON vehicle_passports (lower(current_owner_email))
  WHERE current_owner_email IS NOT NULL;
