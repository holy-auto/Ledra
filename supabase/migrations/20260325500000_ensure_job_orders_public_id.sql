-- =============================================================
-- job_orders: public_id カラムを確実に追加
-- DB上で手動追加された場合もあるため、IF NOT EXISTS で安全に実行
-- =============================================================

-- public_id カラム追加（存在しない場合のみ）
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS public_id text;

-- 既存レコードに public_id を付与（NULL のまま残さない）
UPDATE job_orders
SET public_id = 'jo_' || replace(gen_random_uuid()::text, '-', '')
WHERE public_id IS NULL;

-- NOT NULL 制約を設定（既存データがすべて埋まってから）
ALTER TABLE job_orders ALTER COLUMN public_id SET NOT NULL;

-- デフォルト値を設定（INSERT 時に省略された場合の安全策）
ALTER TABLE job_orders ALTER COLUMN public_id SET DEFAULT ('jo_' || replace(gen_random_uuid()::text, '-', ''));

-- ユニークインデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_orders_public_id ON job_orders(public_id);
