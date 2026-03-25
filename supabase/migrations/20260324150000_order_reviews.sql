-- =============================================================
-- order_reviews: 取引完了後の相互評価
-- 双方が送信後に同時公開（published_at をセット）
-- =============================================================

CREATE TABLE IF NOT EXISTS order_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id        uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  reviewer_tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reviewed_tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rating              integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             text,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,  -- 双方送信後にセット
  UNIQUE (job_order_id, reviewer_tenant_id)
);

ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分が評価者の場合は常に見える / 公開後は被評価者も見える
CREATE POLICY "order_reviews_select" ON order_reviews FOR SELECT
  USING (
    reviewer_tenant_id IN (SELECT my_tenant_ids())
    OR (published_at IS NOT NULL AND reviewed_tenant_id IN (SELECT my_tenant_ids()))
  );

-- INSERT: 自テナントが評価者で staff 以上
CREATE POLICY "order_reviews_insert" ON order_reviews FOR INSERT
  WITH CHECK (
    reviewer_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(reviewer_tenant_id) IN ('owner','admin','staff')
  );

-- UPDATE: published_at の設定用（サービスロール経由を推奨だが、評価者本人も更新可能に）
CREATE POLICY "order_reviews_update" ON order_reviews FOR UPDATE
  USING (
    reviewer_tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(reviewer_tenant_id) IN ('owner','admin','staff')
  );

CREATE INDEX IF NOT EXISTS idx_order_reviews_order ON order_reviews(job_order_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_reviewed ON order_reviews(reviewed_tenant_id, published_at);

-- ─── 同時公開トリガー ───
-- 双方の評価が揃ったら自動で published_at をセット
CREATE OR REPLACE FUNCTION publish_mutual_reviews()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.order_reviews
  WHERE job_order_id = NEW.job_order_id AND published_at IS NULL;

  -- 双方揃った（2件の未公開レビュー）→ 同時公開
  IF v_count >= 2 THEN
    UPDATE public.order_reviews
    SET published_at = now()
    WHERE job_order_id = NEW.job_order_id AND published_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_reviews_publish
  AFTER INSERT ON order_reviews
  FOR EACH ROW EXECUTE FUNCTION publish_mutual_reviews();
