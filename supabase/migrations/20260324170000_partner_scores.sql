-- =============================================================
-- partner_scores: テナントの取引実績集計
-- ランクシステムなし（客観指標 + バッジのみ）
-- =============================================================

CREATE TABLE IF NOT EXISTS partner_scores (
  tenant_id         uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  total_orders      integer NOT NULL DEFAULT 0,
  completed_orders  integer NOT NULL DEFAULT 0,
  on_time_orders    integer NOT NULL DEFAULT 0,
  cancelled_orders  integer NOT NULL DEFAULT 0,
  avg_rating        numeric(3,2),
  rating_count      integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_scores ENABLE ROW LEVEL SECURITY;

-- SELECT: 全認証ユーザーが参照可（取引先選定に使うため）
DROP POLICY IF EXISTS "partner_scores_select" ON partner_scores;
CREATE POLICY "partner_scores_select" ON partner_scores FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- UPDATE/INSERT: サービスロールのみ（集計処理から更新）

-- ─── 集計ビュー ───
CREATE OR REPLACE VIEW partner_score_view AS
SELECT
  ps.tenant_id,
  t.name AS company_name,
  ps.total_orders,
  ps.completed_orders,
  CASE WHEN ps.total_orders > 0
    THEN round(ps.completed_orders::numeric / ps.total_orders * 100, 1)
    ELSE NULL
  END AS completion_rate,
  CASE WHEN ps.completed_orders > 0
    THEN round(ps.on_time_orders::numeric / ps.completed_orders * 100, 1)
    ELSE NULL
  END AS on_time_rate,
  ps.avg_rating,
  ps.rating_count,
  ps.cancelled_orders,
  ps.updated_at
FROM partner_scores ps
LEFT JOIN tenants t ON t.id = ps.tenant_id;

-- ─── スコア更新関数（API / Edge Function から呼ぶ） ───
CREATE OR REPLACE FUNCTION refresh_partner_score(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total     integer;
  v_completed integer;
  v_on_time   integer;
  v_cancelled integer;
  v_avg       numeric(3,2);
  v_count     integer;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'completed'),
    count(*) FILTER (WHERE status = 'completed' AND (deadline IS NULL OR vendor_completed_at <= deadline + interval '1 day')),
    count(*) FILTER (WHERE status = 'cancelled')
  INTO v_total, v_completed, v_on_time, v_cancelled
  FROM public.job_orders
  WHERE to_tenant_id IS NOT NULL
    AND (from_tenant_id = p_tenant_id OR to_tenant_id = p_tenant_id);

  SELECT avg(rating)::numeric(3,2), count(*)
  INTO v_avg, v_count
  FROM public.order_reviews
  WHERE reviewed_tenant_id = p_tenant_id AND published_at IS NOT NULL;

  INSERT INTO public.partner_scores (tenant_id, total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count, updated_at)
  VALUES (p_tenant_id, v_total, v_completed, v_on_time, v_cancelled, v_avg, v_count, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_orders     = EXCLUDED.total_orders,
    completed_orders = EXCLUDED.completed_orders,
    on_time_orders   = EXCLUDED.on_time_orders,
    cancelled_orders = EXCLUDED.cancelled_orders,
    avg_rating       = EXCLUDED.avg_rating,
    rating_count     = EXCLUDED.rating_count,
    updated_at       = now();
END;
$$;
