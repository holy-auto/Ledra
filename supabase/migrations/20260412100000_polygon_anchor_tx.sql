-- =============================================================
-- Polygon Anchor Transaction Hash (Phase 3e)
-- Stores on-chain anchoring results per certificate image.
--
-- - polygon_tx_hash: 0x-prefixed 66-char tx hash on Polygon
-- - polygon_network: "polygon" (mainnet) or "amoy" (testnet)
--   Used to build the correct Polygonscan explorer URL.
-- =============================================================

ALTER TABLE certificate_images
  ADD COLUMN IF NOT EXISTS polygon_tx_hash text,
  ADD COLUMN IF NOT EXISTS polygon_network text;

ALTER TABLE certificate_images
  DROP CONSTRAINT IF EXISTS certificate_images_polygon_network_chk;
ALTER TABLE certificate_images
  ADD CONSTRAINT certificate_images_polygon_network_chk
  CHECK (polygon_network IS NULL OR polygon_network IN ('polygon','amoy'));

-- Lookup for verifying a given image's on-chain record.
CREATE INDEX IF NOT EXISTS idx_certimg_polygon_tx_hash ON certificate_images (polygon_tx_hash);
