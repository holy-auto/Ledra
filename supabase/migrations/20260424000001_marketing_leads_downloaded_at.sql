-- =============================================================
-- marketing_leads: track whether the requested resource PDF was
-- actually downloaded. Set by the PDF route on a successful 200
-- response when the caller passes `?lead=<id>`.
-- =============================================================

ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS downloaded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_marketing_leads_downloaded_at
  ON marketing_leads (downloaded_at DESC)
  WHERE downloaded_at IS NOT NULL;
