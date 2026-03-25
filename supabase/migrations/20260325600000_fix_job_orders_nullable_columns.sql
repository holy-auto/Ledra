-- =============================================================
-- job_orders: 全カラムの NOT NULL 制約を正規化
-- 本来 nullable であるべきカラムから NOT NULL を除去し、
-- DB手動変更による不整合を一括修正する
-- =============================================================

-- 任意カラム: NOT NULL を DROP（すでに nullable なら no-op）
ALTER TABLE job_orders ALTER COLUMN description DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN category DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN budget DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN deadline DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN order_number DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN accepted_amount DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN payment_method DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN vendor_completed_at DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN client_approved_at DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN cancelled_by DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN cancel_reason DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN updated_at DROP NOT NULL;

-- 必須カラム: NOT NULL を確保（本来 NOT NULL であるべきもの）
-- from_tenant_id, title, status, payment_status,
-- payment_confirmed_by_client, payment_confirmed_by_vendor, public_id
-- → これらは既にマイグレーションで NOT NULL 設定済みなので触らない
