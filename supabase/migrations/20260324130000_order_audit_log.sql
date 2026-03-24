-- =============================================================
-- order_audit_log: 受発注のステータス変更・金額変更等の監査ログ
-- =============================================================

CREATE TABLE IF NOT EXISTS order_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id    uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  action          text NOT NULL,
  -- created, status_changed, amount_set, payment_confirmed, cancelled, review_submitted
  old_value       jsonb,
  new_value       jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: 取引関係テナントのメンバーのみ
CREATE POLICY "order_audit_log_select" ON order_audit_log FOR SELECT
  USING (job_order_id IN (
    SELECT id FROM job_orders
    WHERE from_tenant_id IN (SELECT my_tenant_ids())
       OR to_tenant_id   IN (SELECT my_tenant_ids())
  ));

-- INSERT: サービスロール（API経由）のみ。RLSのINSERTポリシーなし → anon/authenticatedではINSERT不可

CREATE INDEX IF NOT EXISTS idx_order_audit_log_order ON order_audit_log(job_order_id, created_at);
