-- =============================================================
-- job_orders: 20260325600000 で誤って除去された NOT NULL 制約を復旧
-- public_id, payment_status, payment_confirmed_by_* は NOT NULL 必須
-- =============================================================

-- public_id: NULL が残っていれば埋める
UPDATE job_orders
SET public_id = 'jo_' || encode(gen_random_bytes(12), 'hex')
WHERE public_id IS NULL;

ALTER TABLE job_orders ALTER COLUMN public_id SET NOT NULL;

-- payment_status: NULL → デフォルト 'unpaid'
UPDATE job_orders
SET payment_status = 'unpaid'
WHERE payment_status IS NULL;

ALTER TABLE job_orders ALTER COLUMN payment_status SET NOT NULL;

-- payment_confirmed_by_client: NULL → false
UPDATE job_orders
SET payment_confirmed_by_client = false
WHERE payment_confirmed_by_client IS NULL;

ALTER TABLE job_orders ALTER COLUMN payment_confirmed_by_client SET NOT NULL;

-- payment_confirmed_by_vendor: NULL → false
UPDATE job_orders
SET payment_confirmed_by_vendor = false
WHERE payment_confirmed_by_vendor IS NULL;

ALTER TABLE job_orders ALTER COLUMN payment_confirmed_by_vendor SET NOT NULL;

-- created_at / updated_at: NULL → now()
UPDATE job_orders SET created_at = now() WHERE created_at IS NULL;
UPDATE job_orders SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE job_orders ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE job_orders ALTER COLUMN updated_at SET NOT NULL;
