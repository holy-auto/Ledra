-- =============================================================
-- Passport API metered billing (Stripe)
--
-- We bill external passport API consumers by metered usage (per API
-- call). Stripe is the source of truth for invoices; this DB only
-- holds the link to the Stripe customer/subscription item and a
-- monthly rollup table so we have an auditable record of what we
-- reported.
--
-- passport_api_consumers gains:
--   stripe_customer_id           — Stripe Customer ("cus_...")
--   stripe_subscription_item_id  — Subscription item on a metered price
--                                  ("si_..."). When set, the monthly cron
--                                  reports usage via subscription_items
--                                  .createUsageRecord (action='set' for
--                                  idempotent re-runs). When null, we
--                                  still aggregate counts internally for
--                                  manual invoicing.
--
-- passport_api_billing_periods rolls up one row per (consumer, month).
-- Re-running the cron for the same month updates `call_count` and re-
-- POSTs to Stripe with action='set' so duplicates net to zero.
-- =============================================================

ALTER TABLE passport_api_consumers
  ADD COLUMN IF NOT EXISTS stripe_customer_id          text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_item_id text;

COMMENT ON COLUMN passport_api_consumers.stripe_subscription_item_id IS
  'Stripe subscription_item on a metered price; when null, no Stripe usage is reported.';

CREATE TABLE IF NOT EXISTS passport_api_billing_periods (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id              uuid NOT NULL REFERENCES passport_api_consumers (id) ON DELETE CASCADE,

  -- Half-open [period_start, period_end). Always calendar-month
  -- boundaries in UTC so two re-runs of the cron always land on
  -- exactly the same pair.
  period_start             date NOT NULL,
  period_end               date NOT NULL,

  call_count               int  NOT NULL DEFAULT 0,

  reported_to_stripe_at    timestamptz,
  stripe_usage_record_id   text,

  last_attempt_at          timestamptz NOT NULL DEFAULT now(),
  last_error               text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (consumer_id, period_start),
  CHECK (period_end > period_start)
);

COMMENT ON TABLE passport_api_billing_periods IS
  'One row per (consumer, calendar month). Aggregated from passport_api_call_logs by the monthly billing cron.';

CREATE INDEX IF NOT EXISTS idx_passport_billing_consumer_period
  ON passport_api_billing_periods (consumer_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_passport_billing_unreported
  ON passport_api_billing_periods (period_start)
  WHERE reported_to_stripe_at IS NULL;

ALTER TABLE passport_api_billing_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passport_api_billing_service_role" ON passport_api_billing_periods;
CREATE POLICY "passport_api_billing_service_role"
  ON passport_api_billing_periods
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_passport_billing_touch ON passport_api_billing_periods;
CREATE TRIGGER trg_passport_billing_touch
  BEFORE UPDATE ON passport_api_billing_periods
  FOR EACH ROW
  EXECUTE FUNCTION touch_vehicle_passports_updated_at();
