-- =============================================================
-- Vehicle Passport Meta-Anchor (PR-7)
--
-- One Polygon tx that summarizes "the entire history of this VIN".
--
-- meta_anchor_hash       SHA-256 over the canonical digest of:
--                          VIN  ||  ":"  ||  sorted-asc(polygon_tx_hash)*
--                        All anchored cert images that contribute to the
--                        passport feed this digest. Sorting eliminates
--                        ordering ambiguity between recomputes.
--
-- meta_anchor_tx_hash    The Polygon tx that anchored the above hash.
-- meta_anchor_network    'polygon' | 'amoy' for the tx (mirrors
--                        certificate_images.polygon_network so historical
--                        anchors can still be verified after network cutover).
-- meta_anchor_anchored_at  When the tx was confirmed.
-- meta_anchor_image_count  How many anchored images contributed to this hash.
-- meta_anchor_cert_count   How many anchored certificates contributed.
--
-- Re-anchoring policy:
--   upsertVehiclePassport recomputes meta_anchor_hash on every call.
--   When the new hash differs from the stored one we submit a fresh tx;
--   identical hash → noop (free). See src/lib/passport/metaAnchor.ts.
--
-- See: docs/vehicle-passport-design.md §9 PR-7
-- =============================================================

ALTER TABLE vehicle_passports
  ADD COLUMN IF NOT EXISTS meta_anchor_hash        text,
  ADD COLUMN IF NOT EXISTS meta_anchor_tx_hash     text,
  ADD COLUMN IF NOT EXISTS meta_anchor_network     text,
  ADD COLUMN IF NOT EXISTS meta_anchor_anchored_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_anchor_image_count int,
  ADD COLUMN IF NOT EXISTS meta_anchor_cert_count  int;

ALTER TABLE vehicle_passports
  DROP CONSTRAINT IF EXISTS vehicle_passports_meta_anchor_network_chk;
ALTER TABLE vehicle_passports
  ADD CONSTRAINT vehicle_passports_meta_anchor_network_chk
  CHECK (meta_anchor_network IS NULL OR meta_anchor_network IN ('polygon','amoy'));

COMMENT ON COLUMN vehicle_passports.meta_anchor_hash IS
  'SHA-256 over VIN + sorted joined polygon_tx_hash list. Recomputable client-side from the public verify API.';
COMMENT ON COLUMN vehicle_passports.meta_anchor_tx_hash IS
  'Polygon tx hash that anchored meta_anchor_hash on-chain.';

-- Surface unverified or out-of-date meta-anchors for the (future) cron
-- re-anchor sweep. Index only when populated to keep the table light.
CREATE INDEX IF NOT EXISTS idx_vehicle_passports_meta_anchor_tx
  ON vehicle_passports (meta_anchor_tx_hash)
  WHERE meta_anchor_tx_hash IS NOT NULL;
