-- 取引先請求設定テーブル
-- from_tenant_id = 発注元テナント（Ledraに対する支払い方法の設定）
CREATE TABLE IF NOT EXISTS tenant_billing_settings (
  tenant_id    uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  billing_timing text NOT NULL DEFAULT 'on_inspection'
    CHECK (billing_timing IN ('on_inspection', 'monthly')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

COMMENT ON TABLE tenant_billing_settings IS '発注元テナントの請求タイミング設定（都度 or 末締め翌末）';
COMMENT ON COLUMN tenant_billing_settings.billing_timing IS 'on_inspection=検収都度, monthly=末締め翌月末払い';

-- job_orders に billing_timing を追加
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS billing_timing text NOT NULL DEFAULT 'on_inspection'
    CHECK (billing_timing IN ('on_inspection', 'monthly'));

COMMENT ON COLUMN job_orders.billing_timing IS '注文作成時に tenant_billing_settings から引き継ぐ請求タイミング';
