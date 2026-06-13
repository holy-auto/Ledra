-- =============================================================
-- 技術者別パフォーマンス分析 (Technician Performance) Migration
--
-- 請求書 (= documents.doc_type='invoice') に施工担当者
-- (assigned_user_id) を持たせ、担当者単位で件数 / 売上 / 平均単価 /
-- 完了率を集計できるようにする。
--
-- job_progress (20260613000025) と同様、`invoices` は documents 上の
-- VIEW なので、列追加は documents に対して行い VIEW を再定義する。
-- =============================================================

-- ① documents に施工担当者列を追加
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN documents.assigned_user_id IS
  '施工担当者 (技術者) の auth.users id。技術者別パフォーマンス分析用。NULL は未割当。';

-- ② 担当者別集計のホットパス用インデックス (tenant_id, assigned_user_id) は
--    CONCURRENTLY が必要なため別ファイル
--    20260613000026a_technician_performance_index.sql に分離。

-- ③ 後方互換 invoices VIEW を assigned_user_id + job_status 込みで再定義
CREATE OR REPLACE VIEW invoices AS
SELECT
  id, tenant_id, customer_id,
  doc_number AS invoice_number,
  issued_at, due_date, status,
  job_status,
  assigned_user_id,
  subtotal, tax, total, tax_rate,
  note, items_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
FROM documents
WHERE doc_type = 'invoice';

-- ④ VIEW 書き込みルールを assigned_user_id 対応で再作成
CREATE OR REPLACE RULE invoices_insert AS
ON INSERT TO invoices DO INSTEAD
INSERT INTO documents (
  id, tenant_id, customer_id,
  doc_type, doc_number, issued_at, due_date,
  status, job_status, assigned_user_id, subtotal, tax, total, tax_rate,
  items_json, note, meta_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
) VALUES (
  COALESCE(NEW.id, gen_random_uuid()), NEW.tenant_id, NEW.customer_id,
  'invoice', NEW.invoice_number, NEW.issued_at, NEW.due_date,
  NEW.status, COALESCE(NEW.job_status, 'draft'), NEW.assigned_user_id, NEW.subtotal, NEW.tax, NEW.total, COALESCE(NEW.tax_rate, 10),
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
  job_status = NEW.job_status,
  assigned_user_id = NEW.assigned_user_id,
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
