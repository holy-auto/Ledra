-- Stripe webhook idempotency table
-- Prevents duplicate processing when Stripe retries webhook delivery.

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    text NOT NULL UNIQUE,
  event_type  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_spe_event_id ON stripe_processed_events (event_id);

-- Auto-cleanup: keep only last 90 days (run via cron or manual)
COMMENT ON TABLE stripe_processed_events IS 'Stripe webhook idempotency. Rows older than 90 days can be safely deleted.';

-- RLS: service role only (webhooks use service role client)
ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;
