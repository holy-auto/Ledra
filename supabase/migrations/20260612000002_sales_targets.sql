-- =============================================================
-- Sales Targets (売上目標 / PDCA) Migration
-- 月次の売上・受注件数・新規顧客の目標値をテナント単位で保持。
-- 実績との対比は API 側 (management-kpi / staff-performance) で算出。
-- =============================================================

CREATE TABLE IF NOT EXISTS sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_revenue integer,
  target_jobs integer,
  target_new_customers integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year, month)
);

-- RLS: テナント分離。複数テナント所属ユーザーにも対応するため
-- `= (... limit 1)` ではなく `IN (...)` で全所属テナントを許可する。
ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_targets_tenant_read ON sales_targets;
CREATE POLICY sales_targets_tenant_read ON sales_targets
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

-- 書き込み (insert/update/delete) も RLS で許可。API は RLS 準拠の
-- server クライアントで upsert するため WITH CHECK が必須。
DROP POLICY IF EXISTS sales_targets_tenant_write ON sales_targets;
CREATE POLICY sales_targets_tenant_write ON sales_targets
  FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

-- Index (sales_targets はこのマイグレーションで作成した空テーブルなので
-- CONCURRENTLY は不要)。
CREATE INDEX IF NOT EXISTS idx_sales_targets_tenant_ym ON sales_targets(tenant_id, year, month);

-- updated_at トリガー (既存 follow_up_settings と同じ set_updated_at() を流用)
CREATE TRIGGER set_sales_targets_updated_at
  BEFORE UPDATE ON sales_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
