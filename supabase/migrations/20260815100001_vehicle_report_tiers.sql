-- =============================================================
-- Vehicle report — staged / partial tiers + per-order scope
--
-- Extends the flat "free summary / paid full report" model into a ladder:
--   free summary → 部分レポート (直近N ヶ月) → 全履歴フル.
--
-- Design: docs/merchant-revenue-sharing-design.md §9
--
--   - `vehicle_report_tiers`: platform-wide offerings. Each tier has a price
--     and a *scope* (`full` or `recent_months:N`) that bounds which records
--     the purchase discloses.
--   - `vehicle_report_orders` gains the purchased tier + scope snapshot, so
--     both the `/v/[vin]` display and the revenue-share proration can be
--     limited to the records a given purchase actually exposed (never pay a
--     shop whose records were not shown).
--
-- Writes: service-role only. Tiers are read server-side (public page +
-- checkout), so no anon SELECT policy is required.
-- =============================================================

-- -------------------------------------------------------------
-- 1) vehicle_report_tiers
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_report_tiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key      text UNIQUE NOT NULL,
  label         text NOT NULL,
  description   text,
  price_jpy     integer NOT NULL CHECK (price_jpy >= 100 AND price_jpy <= 1000000),

  -- Scope: which records the purchase discloses.
  scope_type    text NOT NULL DEFAULT 'full'
                  CHECK (scope_type IN ('full', 'recent_months')),
  scope_months  integer CHECK (scope_months IS NULL OR (scope_months >= 1 AND scope_months <= 600)),

  sort_order    integer NOT NULL DEFAULT 100,
  enabled       boolean NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- recent_months tiers must carry a month count; full must not.
  CONSTRAINT vehicle_report_tiers_scope_chk CHECK (
    (scope_type = 'recent_months' AND scope_months IS NOT NULL) OR
    (scope_type = 'full' AND scope_months IS NULL)
  )
);

-- Seed the initial ladder (idempotent).
INSERT INTO vehicle_report_tiers (tier_key, label, description, price_jpy, scope_type, scope_months, sort_order)
VALUES
  ('recent12', '直近1年レポート', 'この車両の直近1年間の施工履歴（ブロックチェーン認証付き）', 1500, 'recent_months', 12, 10),
  ('full',     '全履歴レポート',  'この車両の全期間・全施工店の履歴（ブロックチェーン認証付き）', 3000, 'full',          NULL, 20)
ON CONFLICT (tier_key) DO NOTHING;

CREATE OR REPLACE FUNCTION touch_vehicle_report_tiers_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$;

DROP TRIGGER IF EXISTS trg_vehicle_report_tiers_touch ON vehicle_report_tiers;
CREATE TRIGGER trg_vehicle_report_tiers_touch
  BEFORE UPDATE ON vehicle_report_tiers
  FOR EACH ROW EXECUTE FUNCTION touch_vehicle_report_tiers_updated_at();

ALTER TABLE vehicle_report_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_report_tiers_service_role_all" ON vehicle_report_tiers;
CREATE POLICY "vehicle_report_tiers_service_role_all" ON vehicle_report_tiers
  FOR ALL USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 2) vehicle_report_orders : purchased tier + scope snapshot
--    Existing rows default to 'full' — they were sold as full history,
--    which is the correct interpretation.
-- -------------------------------------------------------------
ALTER TABLE vehicle_report_orders
  ADD COLUMN IF NOT EXISTS tier_key     text,
  ADD COLUMN IF NOT EXISTS scope_type   text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS scope_months integer,
  -- Absolute lower bound resolved at checkout (now − scope_months). NULL for
  -- full. Anchoring the cutoff at purchase keeps what the buyer sees and what
  -- merchants earn from identical for the whole access window (no drift as a
  -- relative "recent N months" would have).
  ADD COLUMN IF NOT EXISTS scope_from   timestamptz;

-- Constrain scope_type (widen-safe: existing rows are all 'full').
ALTER TABLE vehicle_report_orders
  DROP CONSTRAINT IF EXISTS vehicle_report_orders_scope_type_check;
ALTER TABLE vehicle_report_orders
  ADD CONSTRAINT vehicle_report_orders_scope_type_check
    CHECK (scope_type IN ('full', 'recent_months')) NOT VALID;
ALTER TABLE vehicle_report_orders
  VALIDATE CONSTRAINT vehicle_report_orders_scope_type_check;
