-- =============================================================
-- 作業進捗ボード (Job Progress Board) Migration
--
-- 「請求書 (= 帳票 documents.doc_type='invoice')」に施工進捗ステータスを
-- 持たせ、Kanban 風の進捗ボードで管理できるようにする。
--
-- 重要な設計判断:
--   `invoices` は実テーブルではなく `documents WHERE doc_type='invoice'`
--   のVIEW (20260323010000_unify_invoices_to_documents.sql 参照)。
--   さらに documents.status は請求書ライフサイクル
--   ('draft','sent','accepted','paid','rejected','cancelled') を表す
--   CHECK 制約付きカラムで、課金/帳票処理に利用されている。
--
--   進捗ボードの 6 ステージ
--   ('draft','booked','in_progress','qc','ready','delivered') は
--   documents.status の意味論と衝突するため、既存 status は再利用せず、
--   進捗専用カラム `job_status` を documents に追加する。
--   後方互換の `invoices` VIEW に `job_status` を露出し、
--   進捗ボード API はこの列を読み書きする。
-- =============================================================

-- ① documents に進捗ステータス列を追加 (CHECK で 6 ステージに限定)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS job_status text NOT NULL DEFAULT 'draft';

-- CHECK は NOT VALID で追加 (既存行への ACCESS EXCLUSIVE フルスキャンを回避)、
-- 直後に VALIDATE で軽量ロックの検証を行う。新規 default 'draft' は CHECK を満たす。
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_job_status_check'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_job_status_check
      CHECK (job_status IN ('draft','booked','in_progress','qc','ready','delivered')) NOT VALID;
    ALTER TABLE documents VALIDATE CONSTRAINT documents_job_status_check;
  END IF;
END $$;

COMMENT ON COLUMN documents.job_status IS
  '施工進捗ステータス (作業進捗ボード用)。請求書ライフサイクルの status とは別軸。';

-- ② 進捗ボードのホットパス用インデックス (tenant_id, job_status) は
--    CONCURRENTLY が必要なため別ファイル 20260613000025a_job_progress_index.sql に分離。

-- ③ 後方互換 invoices VIEW を job_status 込みで再定義
--    (20260323080000_scale_indexes_types.sql の定義をベースに job_status を追加)
CREATE OR REPLACE VIEW invoices AS
SELECT
  id, tenant_id, customer_id,
  doc_number AS invoice_number,
  issued_at, due_date, status,
  job_status,
  subtotal, tax, total, tax_rate,
  note, items_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
FROM documents
WHERE doc_type = 'invoice';

-- ④ VIEW の書き込みルールを job_status 対応で再作成
--    (CREATE OR REPLACE VIEW で列を追加するとルールはそのまま残るが、
--     job_status を INSERT/UPDATE できるよう明示的に貼り直す)
CREATE OR REPLACE RULE invoices_insert AS
ON INSERT TO invoices DO INSTEAD
INSERT INTO documents (
  id, tenant_id, customer_id,
  doc_type, doc_number, issued_at, due_date,
  status, job_status, subtotal, tax, total, tax_rate,
  items_json, note, meta_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
) VALUES (
  COALESCE(NEW.id, gen_random_uuid()), NEW.tenant_id, NEW.customer_id,
  'invoice', NEW.invoice_number, NEW.issued_at, NEW.due_date,
  NEW.status, COALESCE(NEW.job_status, 'draft'), NEW.subtotal, NEW.tax, NEW.total, COALESCE(NEW.tax_rate, 10),
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
