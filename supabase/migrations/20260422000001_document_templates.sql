-- =============================================================
-- Document Templates (Phase 2 / C plan)
--  - Per-tenant layout templates used to render帳票 PDFs
--  - documents.template_id references templates for per-doc override
--  - tenants.default_template_id for tenant-wide default
-- =============================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text
    CHECK (doc_type IS NULL OR doc_type IN (
      'estimate',
      'delivery',
      'purchase_order',
      'order_confirmation',
      'inspection',
      'receipt',
      'invoice',
      'consolidated_invoice'
    )),
  layout_config jsonb NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE document_templates IS '帳票レイアウトテンプレート。doc_type NULL は全種別共通。';
COMMENT ON COLUMN document_templates.layout_config IS 'LayoutConfig JSON（pdfDocument 参照）';
COMMENT ON COLUMN document_templates.is_default IS 'テナント内のデフォルトテンプレート（doc_type スコープで一意）';

CREATE INDEX IF NOT EXISTS idx_document_templates_tenant
  ON document_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_default
  ON document_templates(tenant_id, doc_type, is_default);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_templates_tenant_select ON document_templates;
CREATE POLICY document_templates_tenant_select ON document_templates
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS document_templates_tenant_insert ON document_templates;
CREATE POLICY document_templates_tenant_insert ON document_templates
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS document_templates_tenant_update ON document_templates;
CREATE POLICY document_templates_tenant_update ON document_templates
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS document_templates_tenant_delete ON document_templates;
CREATE POLICY document_templates_tenant_delete ON document_templates
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

-- Link: per-document override
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL;
COMMENT ON COLUMN documents.template_id IS '帳票テンプレート上書き（NULL の場合はテナントデフォルト→システムデフォルト）';

-- Link: tenant-wide default
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL;
COMMENT ON COLUMN tenants.default_template_id IS 'テナント既定の帳票テンプレート';
