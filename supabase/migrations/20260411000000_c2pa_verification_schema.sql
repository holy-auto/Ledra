-- =============================================================
-- C2PA Verification Schema (Phase 0)
-- Adds authenticity tracking columns to certificate_images.
-- All columns are nullable with safe defaults so existing data
-- remains backward-compatible as 'unverified'.
--
-- Grade progression (see src/lib/anchoring/authenticityGrade.ts):
--   unverified -> basic -> verified -> premium
-- =============================================================

ALTER TABLE certificate_images
  ADD COLUMN IF NOT EXISTS sha256                       text,
  ADD COLUMN IF NOT EXISTS perceptual_hash              text,
  ADD COLUMN IF NOT EXISTS c2pa_manifest_cid            text,
  ADD COLUMN IF NOT EXISTS c2pa_verified                boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_attestation_provider  text,
  ADD COLUMN IF NOT EXISTS device_attestation_verified  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exif_captured_at             timestamptz,
  ADD COLUMN IF NOT EXISTS exif_device_model            text,
  ADD COLUMN IF NOT EXISTS exif_gps_stripped            boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deepfake_score               numeric(5,4),
  ADD COLUMN IF NOT EXISTS deepfake_verdict             text,
  ADD COLUMN IF NOT EXISTS authenticity_grade           text         NOT NULL DEFAULT 'unverified';

-- Constrain enum-like columns to known values. These are application-enforced,
-- but a CHECK keeps ad-hoc SQL writes honest.
ALTER TABLE certificate_images
  DROP CONSTRAINT IF EXISTS certificate_images_device_attestation_provider_chk;
ALTER TABLE certificate_images
  ADD CONSTRAINT certificate_images_device_attestation_provider_chk
  CHECK (device_attestation_provider IS NULL OR device_attestation_provider IN ('play_integrity','app_attest','none'));

ALTER TABLE certificate_images
  DROP CONSTRAINT IF EXISTS certificate_images_deepfake_verdict_chk;
ALTER TABLE certificate_images
  ADD CONSTRAINT certificate_images_deepfake_verdict_chk
  CHECK (deepfake_verdict IS NULL OR deepfake_verdict IN ('likely_real','suspicious','likely_fake'));

ALTER TABLE certificate_images
  DROP CONSTRAINT IF EXISTS certificate_images_authenticity_grade_chk;
ALTER TABLE certificate_images
  ADD CONSTRAINT certificate_images_authenticity_grade_chk
  CHECK (authenticity_grade IN ('unverified','basic','verified','premium'));

-- Lookup indexes for dedup (sha256) and public-page filtering (grade).
CREATE INDEX IF NOT EXISTS idx_certimg_sha256              ON certificate_images (sha256);
CREATE INDEX IF NOT EXISTS idx_certimg_authenticity_grade  ON certificate_images (authenticity_grade);
