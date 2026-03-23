CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  register_session_id uuid,  -- FK追加は registers テーブル作成後
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','qr','bank_transfer','other')),
  amount integer NOT NULL,
  received_amount integer,      -- 預り金（おつり計算用）
  change_amount integer DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','partial_refund','voided')),
  refund_amount integer DEFAULT 0,
  refund_reason text,
  note text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_store ON payments(store_id) WHERE store_id IS NOT NULL;
CREATE INDEX idx_payments_document ON payments(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX idx_payments_reservation ON payments(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_payments_customer ON payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_payments_paid_at ON payments(tenant_id, paid_at);
CREATE INDEX idx_payments_status ON payments(tenant_id, status);

-- RLS（my_tenant_role関数は既に存在）
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select_v2 ON payments
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY payments_insert_v2 ON payments
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY payments_update_v2 ON payments
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin', 'staff')
  );

CREATE POLICY payments_delete_v2 ON payments
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- updated_at トリガー
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
