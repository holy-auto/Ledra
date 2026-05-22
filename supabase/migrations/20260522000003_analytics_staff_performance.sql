-- =============================================================
-- Analytics RPC : staff_performance_stats
--
-- Per-staff aggregate stats for the tenant's admin dashboard.
-- Single PG round-trip replaces what would otherwise be N+1
-- queries per staff member (certs / reservations / reviews /
-- authenticity grades / repeat customers).
--
-- Returns one row per staff member who has *any* activity
-- (cert issued, reservation assigned, or review received) in
-- the window. Members with no activity are filtered out so the
-- UI can still surface them via tenant_memberships join.
--
-- Window:
--   p_since (timestamptz) — inclusive lower bound. Pass `now()
--   - interval '30 days'` for last-month view, etc. Pass NULL
--   to mean "no lower bound" (all-time).
--
-- Security:
--   STABLE + caller-bound (no SECURITY DEFINER). RLS on the
--   underlying tables already filters to the caller's tenant
--   via my_tenant_ids(). The p_tenant_id arg is used to
--   intersect — the caller must already be a member of that
--   tenant to see any rows back.
-- =============================================================

CREATE OR REPLACE FUNCTION public.staff_performance_stats(
  p_tenant_id uuid,
  p_since     timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id                 uuid,
  cert_count              bigint,
  cert_anchored_count     bigint,
  avg_authenticity_grade  numeric,
  review_count            bigint,
  avg_review_rating       numeric,
  reservations_completed  bigint,
  reservations_cancelled  bigint,
  avg_work_minutes        numeric,
  distinct_customers      bigint,
  returning_customers     bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH
  -- Certificates issued by each staff member in window.
  cert_base AS (
    SELECT
      c.id,
      c.created_by AS user_id,
      c.customer_id
    FROM public.certificates c
    WHERE c.tenant_id = p_tenant_id
      AND c.created_by IS NOT NULL
      AND (p_since IS NULL OR c.created_at >= p_since)
  ),
  cert_stats AS (
    SELECT
      user_id,
      COUNT(*)::bigint AS cert_count,
      COUNT(DISTINCT customer_id)::bigint AS distinct_customers,
      COUNT(DISTINCT customer_id) FILTER (
        WHERE customer_id IN (
          SELECT customer_id FROM cert_base cb2
          WHERE cb2.user_id = cert_base.user_id
          GROUP BY customer_id
          HAVING COUNT(*) > 1
        )
      )::bigint AS returning_customers
    FROM cert_base
    GROUP BY user_id
  ),
  -- Anchored cert count + avg authenticity grade
  -- (numeric encoding: unverified=0, basic=1, verified=2, premium=3).
  anchored_stats AS (
    SELECT
      cb.user_id,
      COUNT(DISTINCT cb.id) FILTER (WHERE ci.polygon_tx_hash IS NOT NULL)::bigint AS cert_anchored_count,
      AVG(
        CASE ci.authenticity_grade
          WHEN 'unverified' THEN 0
          WHEN 'basic'      THEN 1
          WHEN 'verified'   THEN 2
          WHEN 'premium'    THEN 3
        END
      ) AS avg_authenticity_grade
    FROM cert_base cb
    LEFT JOIN public.certificate_images ci ON ci.certificate_id = cb.id
    GROUP BY cb.user_id
  ),
  -- Customer reviews (1-5 star) on this staff's certificates.
  review_stats AS (
    SELECT
      cb.user_id,
      COUNT(sr.id)::bigint AS review_count,
      AVG(sr.rating)::numeric AS avg_review_rating
    FROM cert_base cb
    JOIN public.signature_reviews sr ON sr.certificate_id = cb.id
    WHERE sr.tenant_id = p_tenant_id
    GROUP BY cb.user_id
  ),
  -- Reservations assigned to each staff member.
  res_stats AS (
    SELECT
      r.assigned_user_id AS user_id,
      COUNT(*) FILTER (WHERE r.status = 'completed')::bigint AS reservations_completed,
      COUNT(*) FILTER (WHERE r.status = 'cancelled')::bigint AS reservations_cancelled,
      AVG(
        EXTRACT(EPOCH FROM (r.work_completed_at - r.work_started_at)) / 60.0
      ) FILTER (
        WHERE r.work_completed_at IS NOT NULL
          AND r.work_started_at IS NOT NULL
          AND r.work_completed_at > r.work_started_at
      )::numeric AS avg_work_minutes
    FROM public.reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.assigned_user_id IS NOT NULL
      AND (p_since IS NULL OR r.created_at >= p_since)
    GROUP BY r.assigned_user_id
  )
  SELECT
    u.user_id,
    COALESCE(cs.cert_count, 0)             AS cert_count,
    COALESCE(a.cert_anchored_count, 0)     AS cert_anchored_count,
    a.avg_authenticity_grade,
    COALESCE(rv.review_count, 0)           AS review_count,
    rv.avg_review_rating,
    COALESCE(rs.reservations_completed, 0) AS reservations_completed,
    COALESCE(rs.reservations_cancelled, 0) AS reservations_cancelled,
    rs.avg_work_minutes,
    COALESCE(cs.distinct_customers, 0)     AS distinct_customers,
    COALESCE(cs.returning_customers, 0)    AS returning_customers
  FROM (
    -- Union the user_ids active in *any* stat so we don't lose
    -- staff that only have reservations or only have reviews.
    SELECT user_id FROM cert_stats
    UNION
    SELECT user_id FROM res_stats
    UNION
    SELECT user_id FROM review_stats WHERE user_id IS NOT NULL
  ) u
  LEFT JOIN cert_stats     cs ON cs.user_id = u.user_id
  LEFT JOIN anchored_stats a  ON a.user_id  = u.user_id
  LEFT JOIN review_stats   rv ON rv.user_id = u.user_id
  LEFT JOIN res_stats      rs ON rs.user_id = u.user_id
$$;

COMMENT ON FUNCTION public.staff_performance_stats(uuid, timestamptz) IS
  'Per-staff aggregate stats: cert count, anchored count, avg authenticity grade, review rating, reservation outcomes, avg work time, customer retention. Window via p_since (NULL = all-time).';

GRANT EXECUTE ON FUNCTION public.staff_performance_stats(uuid, timestamptz)
  TO anon, authenticated, service_role;
