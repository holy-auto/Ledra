-- =============================================================
-- Scale Hardening Migration
-- RLS性能向上インデックス、CASCADE→RESTRICT変更、CHECK制約、
-- 複合インデックス追加、pos_checkout関数の連番race condition修正
-- =============================================================

-- ─── 1. tenant_memberships 複合インデックス（RLS性能の生命線） ───
CREATE INDEX IF NOT EXISTS idx_tm_user_tenant
  ON tenant_memberships(user_id, tenant_id);

-- ─── 2. CASCADE → RESTRICT 変更（金銭データ保護） ───
-- 実際のFK制約名を動的に検索して DROP & 再作成する
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- payments.tenant_id: CASCADE → RESTRICT
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'payments'
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'tenant_id';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.payments ADD CONSTRAINT payments_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;

  -- documents.tenant_id: CASCADE → RESTRICT
  v_constraint_name := NULL;
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'documents'
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'tenant_id';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.documents DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.documents ADD CONSTRAINT documents_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;

  -- register_sessions.tenant_id: CASCADE → RESTRICT
  v_constraint_name := NULL;
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'register_sessions'
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'tenant_id';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.register_sessions DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
END $$;

-- ─── 3. payments CHECK 制約（DO $$ブロックで安全に） ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ck_payments_amount_positive'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT ck_payments_amount_positive
      CHECK (amount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ck_payments_change_nonneg'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT ck_payments_change_nonneg
      CHECK (change_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ck_payments_refund_valid'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT ck_payments_refund_valid
      CHECK (refund_amount >= 0 AND refund_amount <= amount);
  END IF;
END $$;

-- ─── 4. 主要テーブル複合インデックス ───
CREATE INDEX IF NOT EXISTS idx_documents_tenant_created
  ON documents(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_created
  ON reservations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_created
  ON payments(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_certs_tenant_created
  ON certificates(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_scheduled
  ON reservations(tenant_id, scheduled_date, status);

-- ─── 5. insurer_users インデックス ───
CREATE INDEX IF NOT EXISTS idx_insurer_users_user_active
  ON insurer_users(user_id, is_active) WHERE is_active = true;

-- ─── 6. pos_checkout 関数（advisory lockで連番race condition修正） ───
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
    -- advisory lock でテナント×月ごとの連番排他制御（race condition防止）
    PERFORM pg_advisory_xact_lock(hashtext('pos_receipt_' || p_tenant_id::text || to_char(now(), 'YYYYMM')));

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
