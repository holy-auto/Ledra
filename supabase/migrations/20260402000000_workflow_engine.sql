-- =============================================================================
-- Workflow Engine Migration
-- ワークフローエンジン: 来店〜会計の1タップ進行フロー
-- =============================================================================

-- 1. workflow_templates: 加盟店カスタマイズ可能なワークフローテンプレート
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = プラットフォーム共通
  name text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('coating', 'ppf', 'wrapping', 'body_repair', 'other')),
  steps jsonb NOT NULL DEFAULT '[]',
  -- steps配列の各要素: {order: int, key: text, label: text, is_customer_visible: bool, estimated_min: int}
  is_default boolean DEFAULT false,
  is_platform boolean DEFAULT false,  -- プラットフォーム共通テンプレート
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_tenant
  ON workflow_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_service_type
  ON workflow_templates(service_type);

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

-- テナントは自分のテンプレートとプラットフォーム共通を参照可
CREATE POLICY "workflow_templates_select" ON workflow_templates
  FOR SELECT USING (
    tenant_id IS NULL  -- プラットフォーム共通
    OR tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "workflow_templates_insert" ON workflow_templates
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "workflow_templates_update" ON workflow_templates
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE POLICY "workflow_templates_delete" ON workflow_templates
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
  );

CREATE TRIGGER trg_workflow_templates_updated_at
  BEFORE UPDATE ON workflow_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 2. reservation_step_logs: 各ステップの開始・完了・所要時間を記録
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_step_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  step_key text NOT NULL,
  step_order integer NOT NULL,
  step_label text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_sec integer,  -- completed_at - started_atを秒で格納
  completed_by uuid REFERENCES auth.users(id),
  note text,
  UNIQUE(reservation_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_step_logs_reservation
  ON reservation_step_logs(reservation_id, step_order);
CREATE INDEX IF NOT EXISTS idx_step_logs_tenant
  ON reservation_step_logs(tenant_id, started_at DESC);

ALTER TABLE reservation_step_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "step_logs_select" ON reservation_step_logs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY "step_logs_insert" ON reservation_step_logs
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY "step_logs_update" ON reservation_step_logs
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()));


-- 3. reservations テーブル拡張: ワークフロー追跡カラム
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS workflow_template_id uuid REFERENCES workflow_templates(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS current_step_key text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS current_step_order integer DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS progress_pct integer DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','partial','refunded'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);

CREATE INDEX IF NOT EXISTS idx_reservations_workflow
  ON reservations(workflow_template_id) WHERE workflow_template_id IS NOT NULL;


-- 4. プラットフォーム共通デフォルトテンプレート（4種）
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workflow_templates (tenant_id, name, service_type, is_platform, is_default, steps) VALUES
(
  NULL,
  'コーティング標準',
  'coating',
  true,
  false,
  '[
    {"order":1,"key":"reception",     "label":"来店受付",    "is_customer_visible":true,  "estimated_min":5},
    {"order":2,"key":"vehicle_check", "label":"車両確認",    "is_customer_visible":false, "estimated_min":10},
    {"order":3,"key":"wash",          "label":"洗車",        "is_customer_visible":true,  "estimated_min":30},
    {"order":4,"key":"base_prep",     "label":"下地処理",    "is_customer_visible":false, "estimated_min":30},
    {"order":5,"key":"coating",       "label":"コーティング施工","is_customer_visible":true,"estimated_min":60},
    {"order":6,"key":"dry",           "label":"乾燥",        "is_customer_visible":true,  "estimated_min":60},
    {"order":7,"key":"inspect",       "label":"検査・仕上げ","is_customer_visible":true,  "estimated_min":15},
    {"order":8,"key":"certificate",   "label":"証明書発行",  "is_customer_visible":true,  "estimated_min":5},
    {"order":9,"key":"billing",       "label":"会計",        "is_customer_visible":true,  "estimated_min":5}
  ]'::jsonb
),
(
  NULL,
  'PPF施工標準',
  'ppf',
  true,
  false,
  '[
    {"order":1,"key":"reception",     "label":"来店受付",    "is_customer_visible":true,  "estimated_min":5},
    {"order":2,"key":"vehicle_check", "label":"車両確認",    "is_customer_visible":false, "estimated_min":10},
    {"order":3,"key":"template_cut",  "label":"テンプレートカット","is_customer_visible":false,"estimated_min":30},
    {"order":4,"key":"wash",          "label":"洗車",        "is_customer_visible":true,  "estimated_min":30},
    {"order":5,"key":"ppf_work",      "label":"PPF施工",     "is_customer_visible":true,  "estimated_min":120},
    {"order":6,"key":"inspect",       "label":"検査・仕上げ","is_customer_visible":true,  "estimated_min":20},
    {"order":7,"key":"certificate",   "label":"証明書発行",  "is_customer_visible":true,  "estimated_min":5},
    {"order":8,"key":"billing",       "label":"会計",        "is_customer_visible":true,  "estimated_min":5}
  ]'::jsonb
),
(
  NULL,
  'ラッピング標準',
  'wrapping',
  true,
  false,
  '[
    {"order":1,"key":"reception",     "label":"来店受付",    "is_customer_visible":true,  "estimated_min":5},
    {"order":2,"key":"vehicle_check", "label":"車両確認",    "is_customer_visible":false, "estimated_min":10},
    {"order":3,"key":"design_conf",   "label":"デザイン確認","is_customer_visible":true,  "estimated_min":15},
    {"order":4,"key":"wash",          "label":"洗車",        "is_customer_visible":true,  "estimated_min":30},
    {"order":5,"key":"wrap_work",     "label":"ラッピング施工","is_customer_visible":true, "estimated_min":180},
    {"order":6,"key":"inspect",       "label":"検査・仕上げ","is_customer_visible":true,  "estimated_min":15},
    {"order":7,"key":"billing",       "label":"会計",        "is_customer_visible":true,  "estimated_min":5}
  ]'::jsonb
),
(
  NULL,
  '板金修理標準',
  'body_repair',
  true,
  false,
  '[
    {"order":1,"key":"reception",     "label":"来店受付",    "is_customer_visible":true,  "estimated_min":5},
    {"order":2,"key":"damage_check",  "label":"損傷確認・見積","is_customer_visible":true,"estimated_min":20},
    {"order":3,"key":"sheet_metal",   "label":"板金",        "is_customer_visible":false, "estimated_min":120},
    {"order":4,"key":"paint",         "label":"塗装",        "is_customer_visible":false, "estimated_min":120},
    {"order":5,"key":"inspect",       "label":"検査・仕上げ","is_customer_visible":true,  "estimated_min":20},
    {"order":6,"key":"billing",       "label":"会計",        "is_customer_visible":true,  "estimated_min":5}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;
