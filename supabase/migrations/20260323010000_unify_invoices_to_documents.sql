-- =============================================================
-- Unify invoices → documents (請求書を帳票テーブルに一本化)
-- =============================================================

-- ① documents テーブルに invoices 固有の payment_date カラムを追加
-- (recipient_name, show_bank_info, vehicle_id, vehicle_info_json は既存)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS payment_date date;
COMMENT ON COLUMN documents.payment_date IS '入金日';

-- ② 既存 invoices データを documents へマイグレーション
-- invoice_number → doc_number, doc_type = 'invoice' として挿入
-- 重複回避: invoices.id が documents に既に存在しない場合のみ INSERT
INSERT INTO documents (
  id, tenant_id, customer_id,
  doc_type, doc_number, issued_at, due_date,
  status, subtotal, tax, total, tax_rate,
  items_json, note, meta_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
)
SELECT
  i.id, i.tenant_id, i.customer_id,
  'invoice', i.invoice_number, i.issued_at, i.due_date,
  i.status, i.subtotal, i.tax, i.total,
  COALESCE(i.tax_rate, 10),
  i.items_json, i.note, '{}'::jsonb,
  COALESCE(i.is_invoice_compliant, false),
  COALESCE(i.show_seal, false),
  COALESCE(i.show_logo, true),
  COALESCE(i.show_bank_info, false),
  i.recipient_name, i.payment_date,
  i.vehicle_id, COALESCE(i.vehicle_info_json, '{}'::jsonb),
  i.created_at, i.updated_at
FROM invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM documents d WHERE d.id = i.id
);

-- ③ invoices テーブルを DROP して VIEW として再定義（後方互換性）
-- まず invoices の RLS ポリシーを削除
DROP POLICY IF EXISTS invoices_tenant_select ON invoices;
DROP POLICY IF EXISTS invoices_tenant_insert ON invoices;
DROP POLICY IF EXISTS invoices_tenant_update ON invoices;
DROP POLICY IF EXISTS invoices_tenant_delete ON invoices;

-- インデックスを削除
DROP INDEX IF EXISTS idx_invoices_tenant;
DROP INDEX IF EXISTS idx_invoices_customer;

-- invoices テーブルを削除
DROP TABLE IF EXISTS invoices;

-- invoices VIEW を作成（後方互換性）
CREATE OR REPLACE VIEW invoices AS
SELECT
  id,
  tenant_id,
  customer_id,
  doc_number AS invoice_number,
  issued_at,
  due_date,
  status,
  subtotal,
  tax,
  total,
  tax_rate,
  note,
  items_json,
  is_invoice_compliant,
  show_seal,
  show_logo,
  show_bank_info,
  recipient_name,
  payment_date,
  vehicle_id,
  vehicle_info_json,
  created_at,
  updated_at
FROM documents
WHERE doc_type = 'invoice';

-- ④ VIEW に対する INSERT/UPDATE/DELETE ルールを追加（VIEWへの書き込み互換性）
CREATE OR REPLACE RULE invoices_insert AS
ON INSERT TO invoices DO INSTEAD
INSERT INTO documents (
  id, tenant_id, customer_id,
  doc_type, doc_number, issued_at, due_date,
  status, subtotal, tax, total, tax_rate,
  items_json, note, meta_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
) VALUES (
  COALESCE(NEW.id, gen_random_uuid()), NEW.tenant_id, NEW.customer_id,
  'invoice', NEW.invoice_number, NEW.issued_at, NEW.due_date,
  NEW.status, NEW.subtotal, NEW.tax, NEW.total, COALESCE(NEW.tax_rate, 10),
  NEW.items_json, NEW.note, '{}'::jsonb,
  COALESCE(NEW.is_invoice_compliant, false),
  COALESCE(NEW.show_seal, false),
  COALESCE(NEW.show_logo, true),
  COALESCE(NEW.show_bank_info, false),
  NEW.recipient_name, NEW.payment_date,
  NEW.vehicle_id, COALESCE(NEW.vehicle_info_json, '{}'::jsonb),
  COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
);

CREATE OR REPLACE RULE invoices_update AS
ON UPDATE TO invoices DO INSTEAD
UPDATE documents SET
  tenant_id = NEW.tenant_id,
  customer_id = NEW.customer_id,
  doc_number = NEW.invoice_number,
  issued_at = NEW.issued_at,
  due_date = NEW.due_date,
  status = NEW.status,
  subtotal = NEW.subtotal,
  tax = NEW.tax,
  total = NEW.total,
  tax_rate = NEW.tax_rate,
  items_json = NEW.items_json,
  note = NEW.note,
  is_invoice_compliant = NEW.is_invoice_compliant,
  show_seal = NEW.show_seal,
  show_logo = NEW.show_logo,
  show_bank_info = NEW.show_bank_info,
  recipient_name = NEW.recipient_name,
  payment_date = NEW.payment_date,
  vehicle_id = NEW.vehicle_id,
  vehicle_info_json = NEW.vehicle_info_json,
  updated_at = NEW.updated_at
WHERE id = OLD.id;

CREATE OR REPLACE RULE invoices_delete AS
ON DELETE TO invoices DO INSTEAD
DELETE FROM documents WHERE id = OLD.id;
