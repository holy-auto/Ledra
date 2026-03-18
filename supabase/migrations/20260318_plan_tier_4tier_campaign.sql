-- ============================================================
-- plan_tier を4tier化 + キャンペーン管理カラム追加
-- mini → starter への移行、free/starter 追加
-- ============================================================
-- 注意: plan_tier は enum 型 (plan_tier_enum)
-- ADD VALUE は別トランザクションで先に実行する必要がある

-- Step 1: enum に新しい値を追加（別トランザクションで先に実行済み）
-- ALTER TYPE plan_tier_enum ADD VALUE IF NOT EXISTS 'free';
-- ALTER TYPE plan_tier_enum ADD VALUE IF NOT EXISTS 'starter';

-- Step 2: 既存データ移行 + カラム追加
UPDATE tenants SET plan_tier = 'starter' WHERE plan_tier = 'mini';

ALTER TABLE tenants ALTER COLUMN plan_tier SET DEFAULT 'free';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS campaign_slug text;

CREATE INDEX IF NOT EXISTS idx_tenants_campaign_slug
  ON tenants (campaign_slug) WHERE campaign_slug IS NOT NULL;

COMMENT ON COLUMN tenants.campaign_slug IS 'キャンペーン識別子（例: launch_100）。invoice.paid で確定';
