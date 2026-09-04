-- 空 DB 用の補い: core_tables より前の日付に置かれてしまった3本の中身を、
-- 依存が揃ったこの位置で作り直す。
--
-- 経緯: `20260312000000` / `20260313000000` / `20260313000001` は、ファイル名の
-- 日付が `20260313020000_core_tables.sql` より前なのに、その中で作られる
-- tenants / certificates / tenant_memberships に依存していた。空 DB へ
-- **ファイル名順に1パスで**流す Supabase のブランチ機能は1本目で止まる。
-- 3本のファイル名を後ろへ動かせば順序は直るが、**版番号が変わって本番で再適用**
-- になり、当時の役割を見ない RLS ポリシーや search_path 未固定の関数定義が
-- 復活してしまう。そこで3本は「前提が無ければ skip」に変え、実体をここに置く。
--
-- **既にオブジェクトがある DB（本番）では何もしない。** 各ブロックの入口で
-- to_regclass を見て、無いときだけ作る。列追加は ADD COLUMN IF NOT EXISTS。
-- 恒久対応は baseline 方式（docs/operations/migrations.md）。
DO $mig$
BEGIN
  -- ④ 顧客管理テーブル（元: 20260313000000）
  IF to_regclass('public.customers') IS NULL THEN
    CREATE TABLE public.customers (
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

    ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

    CREATE POLICY customers_tenant_select ON public.customers
      FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
    CREATE POLICY customers_tenant_insert ON public.customers
      FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
    CREATE POLICY customers_tenant_update ON public.customers
      FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
    CREATE POLICY customers_tenant_delete ON public.customers
      FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
  END IF;

  -- ⑤ 請求書テーブル（元: 20260313000000）
  -- 本番では後に documents へ統合され、invoices は VIEW になっている。
  -- to_regclass は VIEW にも当たるので、その場合もここは通らない。
  IF to_regclass('public.invoices') IS NULL THEN
    CREATE TABLE public.invoices (
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

    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);

    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

    CREATE POLICY invoices_tenant_select ON public.invoices
      FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
    CREATE POLICY invoices_tenant_insert ON public.invoices
      FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
    CREATE POLICY invoices_tenant_update ON public.invoices
      FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
    CREATE POLICY invoices_tenant_delete ON public.invoices
      FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );
  END IF;

  -- ③ 施工料金と顧客の紐付け（元: 20260313000000）
  ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS service_price integer;
  COMMENT ON COLUMN public.certificates.service_price IS '施工料金（円）。当事者のみ閲覧可。';
  ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

  -- ⑥ 業種区分と都道府県（元: 20260313000001）
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS category text;
  COMMENT ON COLUMN public.tenants.category IS '業種区分: detailing, maintenance, custom, bodywork';
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS prefecture text;
  COMMENT ON COLUMN public.tenants.prefecture IS '都道府県（例: 東京都, 大阪府）';
END
$mig$;
