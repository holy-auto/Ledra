-- =============================================================
-- POS Extensions Migration
-- reservations に支払ステータス追加、certificates に追跡カラム追加、
-- POS会計トランザクションRPC関数
-- =============================================================

-- ─── reservations に支払ステータスカラム追加 ───
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_status text
  DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial', 'refunded'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_id uuid;
-- FK は payments テーブル作成後に追加（下記 DO ブロック）
COMMENT ON COLUMN reservations.payment_status IS 'POS支払ステータス';
COMMENT ON COLUMN reservations.payment_id IS '関連する支払ID';

-- ─── certificates に追跡カラム追加 ───
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS reservation_id uuid
  REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS payment_id uuid;
COMMENT ON COLUMN certificates.reservation_id IS '関連する予約ID';
COMMENT ON COLUMN certificates.payment_id IS '関連する支払ID';

-- ─── documents に payment_date カラム追加（領収書で使用） ───
ALTER TABLE documents ADD COLUMN IF NOT EXISTS payment_date date;
COMMENT ON COLUMN documents.payment_date IS '入金日';

-- ─── インデックス ───
CREATE INDEX IF NOT EXISTS idx_certs_reservation ON certificates(reservation_id)
  WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_payment_status ON reservations(tenant_id, payment_status);

-- ─── payments テーブルへのFK追加（paymentsテーブルが存在する場合） ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments' AND table_schema = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reservations_payment') THEN
      ALTER TABLE reservations ADD CONSTRAINT fk_reservations_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_certificates_payment') THEN
      ALTER TABLE certificates ADD CONSTRAINT fk_certificates_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- =============================================================
-- POS会計処理RPC関数
-- 1トランザクションで payment + receipt + reservation更新
-- =============================================================
CREATE OR REPLACE FUNCTION pos_checkout(
  p_tenant_id uuid,
  p_reservation_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_register_session_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_amount integer DEFAULT 0,
  p_received_amount integer DEFAULT NULL,
  p_items_json jsonb DEFAULT '[]'::jsonb,
  p_tax_rate integer DEFAULT 10,
  p_note text DEFAULT NULL,
  p_create_receipt boolean DEFAULT true,
  p_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_id uuid;
  v_document_id uuid;
  v_change integer;
  v_subtotal integer;
  v_tax integer;
  v_total integer;
  v_doc_number text;
  v_doc_count integer;
  v_reservation record;
BEGIN
  -- 金額計算
  v_total := p_amount;
  v_tax := ROUND(v_total * p_tax_rate::numeric / (100 + p_tax_rate));
  v_subtotal := v_total - v_tax;
  v_change := COALESCE(p_received_amount, v_total) - v_total;
  IF v_change < 0 THEN v_change := 0; END IF;

  -- 1. payment レコード作成
  INSERT INTO public.payments (
    tenant_id, store_id, reservation_id, customer_id, register_session_id,
    payment_method, amount, received_amount, change_amount, status, note,
    paid_at, created_by
  ) VALUES (
    p_tenant_id, p_store_id, p_reservation_id, p_customer_id, p_register_session_id,
    p_payment_method, v_total, p_received_amount, v_change, 'completed', p_note,
    now(), p_user_id
  )
  RETURNING id INTO v_payment_id;

  -- 2. 領収書（receipt）作成
  IF p_create_receipt THEN
    -- 領収書番号の連番取得
    SELECT COUNT(*) + 1 INTO v_doc_count
    FROM public.documents
    WHERE tenant_id = p_tenant_id
      AND doc_type = 'receipt'
      AND doc_number LIKE 'RCP-' || to_char(now(), 'YYYYMM') || '-%';

    v_doc_number := 'RCP-' || to_char(now(), 'YYYYMM') || '-' || LPAD(v_doc_count::text, 3, '0');

    INSERT INTO public.documents (
      tenant_id, customer_id, doc_type, doc_number, issued_at, status,
      subtotal, tax, total, tax_rate, items_json, note,
      is_invoice_compliant, show_seal, show_logo, payment_date
    ) VALUES (
      p_tenant_id, p_customer_id, 'receipt', v_doc_number, CURRENT_DATE, 'paid',
      v_subtotal, v_tax, v_total, p_tax_rate, p_items_json, p_note,
      false, false, true, CURRENT_DATE
    )
    RETURNING id INTO v_document_id;

    -- payment に document_id を紐付け
    UPDATE public.payments SET document_id = v_document_id WHERE id = v_payment_id;
  END IF;

  -- 3. 予約ステータス更新（予約がある場合）
  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation FROM public.reservations
    WHERE id = p_reservation_id AND tenant_id = p_tenant_id;

    IF FOUND THEN
      UPDATE public.reservations
      SET payment_status = 'paid',
          payment_id = v_payment_id,
          status = CASE WHEN status = 'in_progress' THEN 'completed' ELSE status END,
          updated_at = now()
      WHERE id = p_reservation_id;
    END IF;
  END IF;

  -- 4. register_session の集計更新（セッションがある場合）
  IF p_register_session_id IS NOT NULL THEN
    UPDATE public.register_sessions
    SET total_sales = COALESCE(total_sales, 0) + v_total,
        total_transactions = COALESCE(total_transactions, 0) + 1,
        updated_at = now()
    WHERE id = p_register_session_id AND tenant_id = p_tenant_id;
  END IF;

  -- 結果を返す
  RETURN json_build_object(
    'payment_id', v_payment_id,
    'document_id', v_document_id,
    'amount', v_total,
    'change', v_change,
    'doc_number', v_doc_number,
    'status', 'completed'
  );
END;
$$;
