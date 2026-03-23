-- 20260323080000_scale_indexes_types.sql
-- 金額カラムbigint変換 + 追加インデックス + certificate_images tenant_id追加

-- ============================================================
-- 1. 金額カラムをbigintに変換（SUMオーバーフロー防止）
-- ============================================================

-- payments（VIEWなし、直接変換OK）
ALTER TABLE payments ALTER COLUMN amount TYPE bigint;
ALTER TABLE payments ALTER COLUMN received_amount TYPE bigint;
ALTER TABLE payments ALTER COLUMN change_amount TYPE bigint;
ALTER TABLE payments ALTER COLUMN refund_amount TYPE bigint;

-- documents は invoices VIEW が依存しているため、VIEW+RULEを一時DROP
DROP RULE IF EXISTS invoices_delete ON invoices;
DROP RULE IF EXISTS invoices_update ON invoices;
DROP RULE IF EXISTS invoices_insert ON invoices;
DROP VIEW IF EXISTS invoices;

ALTER TABLE documents ALTER COLUMN subtotal TYPE bigint;
ALTER TABLE documents ALTER COLUMN tax TYPE bigint;
ALTER TABLE documents ALTER COLUMN total TYPE bigint;

-- invoices VIEW 再作成
CREATE OR REPLACE VIEW invoices AS
SELECT
  id, tenant_id, customer_id,
  doc_number AS invoice_number,
  issued_at, due_date, status,
  subtotal, tax, total, tax_rate,
  note, items_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at
FROM documents
WHERE doc_type = 'invoice';

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

ALTER TABLE reservations ALTER COLUMN estimated_amount TYPE bigint;

ALTER TABLE certificates ALTER COLUMN service_price TYPE bigint;

-- ============================================================
-- 2. 追加インデックス
-- ============================================================

-- menu_items: アクティブ品目の高速取得
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_active
  ON menu_items(tenant_id, is_active, sort_order) WHERE is_active = true;

-- payments: 顧客別支払履歴
CREATE INDEX IF NOT EXISTS idx_payments_tenant_customer
  ON payments(tenant_id, customer_id) WHERE customer_id IS NOT NULL;

-- payments: 店舗別日次集計
CREATE INDEX IF NOT EXISTS idx_payments_store_date
  ON payments(tenant_id, store_id, paid_at DESC) WHERE store_id IS NOT NULL;

-- documents: 帳票種別+ステータス+日付の複合（リスト表示最適化）
CREATE INDEX IF NOT EXISTS idx_documents_tenant_type_status_created
  ON documents(tenant_id, doc_type, status, created_at DESC);

-- ============================================================
-- 3. certificate_images にtenant_idカラム追加（RLSサブクエリ排除）
-- ============================================================

-- カラム追加
ALTER TABLE certificate_images ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 既存データにtenant_idを埋める
UPDATE certificate_images ci
SET tenant_id = c.tenant_id
FROM certificates c
WHERE ci.certificate_id = c.id AND ci.tenant_id IS NULL;

-- NOT NULL制約追加（既存データ更新後）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM certificate_images WHERE tenant_id IS NULL
  ) THEN
    ALTER TABLE certificate_images ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- FK追加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'fk_certimg_tenant') THEN
    ALTER TABLE certificate_images
      ADD CONSTRAINT fk_certimg_tenant
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_certimg_tenant ON certificate_images(tenant_id);

-- RLSポリシー更新（サブクエリ排除）
DROP POLICY IF EXISTS "certificate_images_select_v2" ON certificate_images;
DROP POLICY IF EXISTS "certificate_images_insert_v2" ON certificate_images;
DROP POLICY IF EXISTS "certificate_images_update_v2" ON certificate_images;
DROP POLICY IF EXISTS "certificate_images_delete_v2" ON certificate_images;

CREATE POLICY "certificate_images_select_v3" ON certificate_images
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY "certificate_images_insert_v3" ON certificate_images
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner','admin','staff')
  );

CREATE POLICY "certificate_images_update_v3" ON certificate_images
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner','admin','staff')
  );

CREATE POLICY "certificate_images_delete_v3" ON certificate_images
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner','admin')
  );
