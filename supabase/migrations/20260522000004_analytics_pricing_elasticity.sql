-- =============================================================
-- Analytics RPC : pricing_elasticity_stats
--
-- Per-offering, per-month aggregate. Surfaces the shop-side
-- question: "at what price points do my customers actually
-- complete vs cancel?"
--
-- We bucket by reservation.title (the human-readable offering
-- name the shop sets) because:
--   1. reservations don't carry a direct service_package_id FK
--      (menu_items_json is a snapshot, not a reference)
--   2. titles are how shops mentally organize their offerings
--      ("ガラスコーティングStandard", "PPF全面", …)
--
-- Returns one row per (title, month) bucket, with counts +
-- price stats. The UI does time-series + cross-offering binning.
--
-- Window:
--   p_since — inclusive lower bound on reservation created_at.
--   Defaults to 12 months back from now.
-- =============================================================

CREATE OR REPLACE FUNCTION public.pricing_elasticity_stats(
  p_tenant_id uuid,
  p_since     timestamptz DEFAULT NULL
)
RETURNS TABLE (
  period_month            date,
  title                   text,
  reservation_count       bigint,
  completed_count         bigint,
  cancelled_count         bigint,
  avg_estimated_amount    numeric,
  min_estimated_amount    integer,
  max_estimated_amount    integer,
  total_completed_revenue bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH bounded AS (
    SELECT
      DATE_TRUNC('month', r.created_at)::date AS period_month,
      COALESCE(NULLIF(TRIM(r.title), ''), '(未設定)') AS title,
      r.status,
      r.estimated_amount
    FROM public.reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.created_at >= COALESCE(p_since, now() - interval '12 months')
  )
  SELECT
    period_month,
    title,
    COUNT(*)::bigint AS reservation_count,
    COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint AS cancelled_count,
    AVG(estimated_amount) FILTER (WHERE estimated_amount IS NOT NULL)::numeric AS avg_estimated_amount,
    MIN(estimated_amount) FILTER (WHERE estimated_amount IS NOT NULL) AS min_estimated_amount,
    MAX(estimated_amount) FILTER (WHERE estimated_amount IS NOT NULL) AS max_estimated_amount,
    COALESCE(
      SUM(estimated_amount) FILTER (WHERE status = 'completed' AND estimated_amount IS NOT NULL),
      0
    )::bigint AS total_completed_revenue
  FROM bounded
  GROUP BY period_month, title
  ORDER BY period_month DESC, reservation_count DESC, title ASC
$$;

COMMENT ON FUNCTION public.pricing_elasticity_stats(uuid, timestamptz) IS
  'Per-(offering title, month) aggregate of reservations + price stats. Defaults to last 12 months. Used by /admin/analytics/pricing.';

GRANT EXECUTE ON FUNCTION public.pricing_elasticity_stats(uuid, timestamptz)
  TO anon, authenticated, service_role;
