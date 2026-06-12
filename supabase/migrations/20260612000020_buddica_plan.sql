-- BUDDICAの専用プランを tenants.plan_tier のチェック制約に追加
-- 既存の CHECK 制約を差し替えて 'buddica' を許容値に加える

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_tier_check
  CHECK (plan_tier IN ('mini', 'free', 'starter', 'standard', 'pro', 'buddica'));

COMMENT ON COLUMN tenants.plan_tier IS
  'プランティア: free / starter / standard / pro / buddica（専用エンタープライズ） ※ mini は旧 starter の互換値';
