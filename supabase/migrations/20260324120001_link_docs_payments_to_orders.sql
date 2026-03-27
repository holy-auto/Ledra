-- =============================================================
-- documents / payments に job_order_id FK を追加
-- 帳票・決済を受発注に紐付ける
-- =============================================================

-- documents に受発注紐付け + 取引相手テナント
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS job_order_id         uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counterparty_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_job_order ON documents(job_order_id) WHERE job_order_id IS NOT NULL;

-- payments に受発注紐付け + Stripe Connect 追跡
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS job_order_id              uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id        text;

CREATE INDEX IF NOT EXISTS idx_payments_job_order ON payments(job_order_id) WHERE job_order_id IS NOT NULL;
