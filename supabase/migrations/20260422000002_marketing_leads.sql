-- =============================================================
-- Marketing Leads
-- Captures leads from the public marketing site (resource downloads,
-- demo requests, contact form, ROI simulator, newsletter).
-- Distinct from customer_inquiries which is for customer↔shop within
-- the app.
-- =============================================================

CREATE TABLE IF NOT EXISTS marketing_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Where the lead came from
  source        text NOT NULL CHECK (source IN (
                   'document_dl',
                   'document_shop',
                   'document_agent',
                   'document_insurer',
                   'demo',
                   'contact',
                   'newsletter',
                   'roi',
                   'pilot',
                   'other'
                )),
  -- Optional finer-grained identifier (e.g. which PDF was requested)
  resource_key  text,

  -- Lead identity
  name          text,
  company       text,
  role          text,
  email         text NOT NULL,
  phone         text,

  -- Segmentation
  industry      text,
  locations     text,
  timing        text,

  -- Free-form message / context (ROI results, message body)
  message       text,
  context       jsonb,

  -- Consent
  consent_at    timestamptz,

  -- Attribution
  referrer      text,
  user_agent    text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,

  -- Workflow
  status        text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'ignored')),
  assigned_to   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at
  ON marketing_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_source
  ON marketing_leads (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_email
  ON marketing_leads (email);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_status
  ON marketing_leads (status, created_at DESC);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION touch_marketing_leads_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS trg_marketing_leads_touch_updated_at ON marketing_leads;
CREATE TRIGGER trg_marketing_leads_touch_updated_at
  BEFORE UPDATE ON marketing_leads
  FOR EACH ROW
  EXECUTE FUNCTION touch_marketing_leads_updated_at();

-- RLS: writes only via service_role (API). No public read.
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_leads_service_role_all" ON marketing_leads;
CREATE POLICY "marketing_leads_service_role_all" ON marketing_leads
  FOR ALL USING (auth.role() = 'service_role');
