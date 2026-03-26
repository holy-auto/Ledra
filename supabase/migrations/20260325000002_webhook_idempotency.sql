-- Ensure unique constraint on event_id for webhook idempotency
-- This may already exist; DO NOTHING if so
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_processed_events_event_id_key'
  ) THEN
    ALTER TABLE stripe_processed_events
      ADD CONSTRAINT stripe_processed_events_event_id_key UNIQUE (event_id);
  END IF;
END $$;
