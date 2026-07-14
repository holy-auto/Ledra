-- ============================================================
-- tenants.plan_tier の CHECK 制約を実態(4tier)に合わせて修正
-- 20260318000001_plan_tier_4tier_campaign.sql は plan_tier を
-- text + CHECK 制約ではなく enum 型だと誤認しており、
-- CHECK 制約 (mini/standard/pro) を更新し忘れていた。
-- そのため plan_tier='free' での INSERT が全件失敗し、
-- 新規登録(/api/signup)が常にロールバックされていた。
-- ============================================================

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;

ALTER TABLE tenants ADD CONSTRAINT tenants_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'standard', 'pro'));
