-- ③ 施工料金フィールド追加 / ④ 顧客管理テーブル / ⑤ 請求書テーブル
--
-- このファイルは本番へ適用済み（version 20260313000000）。**内容だけ**を後から
-- 変えてある。理由は 20260312000000 と同じで、ファイル名の日付が
-- `20260313020000_core_tables.sql` より前なのに certificates / tenants /
-- tenant_memberships に依存している。空 DB へ1パスで流すとここで止まる。
-- ファイル名は動かさない（版番号が変わると本番で再適用になり、ここで作る
-- **役割を見ない RLS ポリシー**が、後から入れた役割別ポリシーを打ち消す）。
--
-- 前提が無いときは何もしない。空 DB 側の実体は
-- `20260313020000_core_tables.sql` の末尾が作る。
-- 恒久対応は baseline 方式（docs/operations/migrations.md）。
DO $mig$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE NOTICE '20260313000000: core_tables 未適用のため skip（core_tables の末尾が同じものを作る）';
    RETURN;
  END IF;

  -- ③ 施工料金フィールド追加
  ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS service_price integer;
  COMMENT ON COLUMN public.certificates.service_price IS '施工料金（円）。当事者のみ閲覧可。';

  -- ④ 顧客管理テーブル
  CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    name_kana text,
    email text,
    phone text,
    postal_code text,
    address text,
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(tenant_id, name);

  -- 証明書と顧客の紐付け
  ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
  CREATE INDEX IF NOT EXISTS idx_certificates_customer ON public.certificates(customer_id);

  -- RLS
  ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS customers_tenant_select ON public.customers;
  CREATE POLICY customers_tenant_select ON public.customers
    FOR SELECT USING (
      tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  DROP POLICY IF EXISTS customers_tenant_insert ON public.customers;
  CREATE POLICY customers_tenant_insert ON public.customers
    FOR INSERT WITH CHECK (
      tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  DROP POLICY IF EXISTS customers_tenant_update ON public.customers;
  CREATE POLICY customers_tenant_update ON public.customers
    FOR UPDATE USING (
      tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  DROP POLICY IF EXISTS customers_tenant_delete ON public.customers;
  CREATE POLICY customers_tenant_delete ON public.customers
    FOR DELETE USING (
      tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  -- ⑤ 請求書テーブル
  CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers(id),
    invoice_number text NOT NULL,
    issued_at date NOT NULL DEFAULT CURRENT_DATE,
    due_date date,
    status text NOT NULL DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
    subtotal integer NOT NULL DEFAULT 0,
    tax integer NOT NULL DEFAULT 0,
    total integer NOT NULL DEFAULT 0,
    note text,
    items_json jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  -- Indexes and RLS only if invoices is a real table (not a VIEW)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices' AND table_type = 'BASE TABLE'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS invoices_tenant_select ON public.invoices;
    CREATE POLICY invoices_tenant_select ON public.invoices
      FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );

    DROP POLICY IF EXISTS invoices_tenant_insert ON public.invoices;
    CREATE POLICY invoices_tenant_insert ON public.invoices
      FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );

    DROP POLICY IF EXISTS invoices_tenant_update ON public.invoices;
    CREATE POLICY invoices_tenant_update ON public.invoices
      FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );

    DROP POLICY IF EXISTS invoices_tenant_delete ON public.invoices;
    CREATE POLICY invoices_tenant_delete ON public.invoices
      FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
  END IF;
END
$mig$;
