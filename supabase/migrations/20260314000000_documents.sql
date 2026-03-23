-- =============================================================
-- Documents (帳票) Migration
-- Adds multi-document-type support: 見積書, 納品書, 発注書,
-- 発注請書, 検収書, 領収書, 請求書, 合算請求書
-- =============================================================

-- ① tenants にインボイス関連カラム追加
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_number text;
COMMENT ON COLUMN tenants.registration_number IS '適格請求書発行事業者登録番号 (T+13桁)';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_seal_path text;
COMMENT ON COLUMN tenants.company_seal_path IS '角印画像の Storage パス';

-- ② documents テーブル
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),

  doc_type text NOT NULL
    CHECK (doc_type IN (
      'estimate',              -- 見積書
      'delivery',              -- 納品書
      'purchase_order',        -- 発注書
      'order_confirmation',    -- 発注請書
      'inspection',            -- 検収書
      'receipt',               -- 領収書
      'invoice',               -- 請求書
      'consolidated_invoice'   -- 合算請求書
    )),
  doc_number text NOT NULL,
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','paid','rejected','cancelled')),

  subtotal integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  tax_rate integer NOT NULL DEFAULT 10,       -- 税率 (10 or 8)

  items_json jsonb NOT NULL DEFAULT '[]',
  note text,
  meta_json jsonb DEFAULT '{}',               -- 書類種別固有データ
  is_invoice_compliant boolean NOT NULL DEFAULT false, -- インボイス対応フラグ
  source_document_id uuid REFERENCES documents(id), -- 書類間リンク
  show_seal boolean NOT NULL DEFAULT false,   -- 角印表示
  show_logo boolean NOT NULL DEFAULT true,    -- ロゴ表示

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(tenant_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_number ON documents(tenant_id, doc_number);

-- ③ RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_tenant_select ON documents;
CREATE POLICY documents_tenant_select ON documents
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS documents_tenant_insert ON documents;
CREATE POLICY documents_tenant_insert ON documents
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS documents_tenant_update ON documents;
CREATE POLICY documents_tenant_update ON documents
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS documents_tenant_delete ON documents;
CREATE POLICY documents_tenant_delete ON documents
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );
