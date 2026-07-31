-- 20260715* バッチのドリフト修復（本番 cahybswpduchptvyvdkk）
--
-- 事象:
--   20260715000000〜20260715000003 の4本が supabase_migrations.schema_migrations に
--   「適用済み」として記録されていたにもかかわらず、DDL は本番に一切反映されていなかった
--   （documents.staff_member_id / staff_members.commission_rate / store_memberships.role /
--    document_templates・documents の doc_type CHECK への staff_invoice 追加 /
--    billing_analytics_stats の週別対応 / RESTRICTIVE ポリシーが全て欠落）。
--   このため /api/admin/documents の GET・PUT が "column documents.staff_member_id does not exist"
--   で 500 になり、帳票管理の一覧表示と「入金済」への更新が失敗していた。
--
-- 対応:
--   既に記録済みのバージョンは通常の migration では再実行されないため、
--   4本の DDL を冪等（IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE）に
--   まとめて再適用する。正しく適用済みの環境では no-op になる。
--   ※ 元の4ファイルは変更しない（履歴の再現性を保つため）。


-- ===== re-apply: 20260715000000_staff_commission_invoices.sql =====
-- 外注職人への内部請求（下請け精算）機能
--
-- 背景:
--   外注職人 (staff_members, kind='external') はログインアカウントを持たず、
--   顧客向け帳票を自ら発行することはできない。一方でテナント側が「この外注職人に
--   いくら支払うか」を管理するため、職人ごとの手数料率（レス率）を設定し、
--   それを自動適用した内部請求書（documents.doc_type='staff_invoice'）を
--   テナント管理者が代理作成できるようにする。
--
-- 設計（既存を壊さない / 追加のみ）:
--   - staff_members.commission_rate: 職人ごとのデフォルトレス率（0〜1）。
--   - documents.doc_type に 'staff_invoice' を追加、documents.staff_member_id で
--     対象の外注職人を指す（customer_id は使わず staff_member_id を使う）。
--   - 金銭データのため、staff_invoice 行だけは RESTRICTIVE ポリシーで
--     管理ロール（super_admin/owner/admin）に限定する。

-- ─── staff_members.commission_rate（レス率） ─────────────────────────────────
-- 新規の nullable カラムで、既存行は全て NULL のため CHECK は即座に検証を通過する
-- （staff_members.assigned_staff_id 追加時と同じ「全行 NULL への inline 制約」パターン）。
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS commission_rate numeric
  CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

COMMENT ON COLUMN staff_members.commission_rate IS
  'レス率（0〜1）。外注請求書 (documents.doc_type=staff_invoice) 作成時の金額自動計算に使うデフォルト値。';

-- ─── documents.doc_type に 'staff_invoice' を追加 ────────────────────────────
-- 既存行がある本番テーブルの CHECK 差し替えのため、lint-migrations の
-- add-check-without-not-valid 規約に従い NOT VALID → VALIDATE CONSTRAINT に分割する。
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'estimate', 'delivery', 'purchase_order', 'order_confirmation',
    'inspection', 'receipt', 'invoice', 'consolidated_invoice', 'staff_invoice'
  ))
  NOT VALID;

ALTER TABLE documents
  VALIDATE CONSTRAINT documents_doc_type_check;

-- ─── documents.staff_member_id（外注請求書の宛先） ───────────────────────────
-- 新規カラム（全行 NULL）への inline REFERENCES なので FK 検証は即時・安全
-- （staff_members.assigned_staff_id 追加時と同じパターン）。検索用インデックスは
-- 必要になった時点で別マイグレーション（CONCURRENTLY）で張る。
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN documents.staff_member_id IS
  '外注請求書 (doc_type=staff_invoice) の宛先となる外注職人。顧客向け帳票では常に NULL。';

-- ─── staff_invoice 行を管理ロール限定にする RESTRICTIVE ポリシー ─────────────
-- documents_tenant_* は PERMISSIVE（テナット全メンバーに開放）のため、
-- 上乗せで絞るには RESTRICTIVE ポリシーが必要（RESTRICTIVE は AND 条件で効く）。
-- staff_invoice 以外の行は常に true（no-op）、staff_invoice 行だけ管理ロールを要求する。
DROP POLICY IF EXISTS documents_staff_invoice_restrict ON documents;
CREATE POLICY documents_staff_invoice_restrict ON documents
  AS RESTRICTIVE
  FOR ALL
  USING (doc_type != 'staff_invoice' OR public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  WITH CHECK (doc_type != 'staff_invoice' OR public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

-- ===== re-apply: 20260715000001_store_membership_role.sql =====
-- 支社（店舗）ごとの担当者（責任者/担当）設定
--
-- 背景:
--   store_memberships は店舗とユーザーの多対多テーブルとして既に存在するが、
--   role カラムが無く「誰が店長で誰が一般担当か」を表現できなかった。また
--   user_id に外部キー制約が無く、削除済みユーザーの割当が残り得た。
--   支社登録画面から実ユーザーを役割付きで担当者アサインできるようにする。

-- ─── role カラム追加（店長 / 担当） ───────────────────────────────────────────
-- 既存行は空テーブル想定だが、NOT NULL DEFAULT 'staff' で安全に埋める
-- （lint-migrations の add-column-not-null-without-default は DEFAULT 付きなら許容）。
ALTER TABLE store_memberships
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staff';

ALTER TABLE store_memberships
  DROP CONSTRAINT IF EXISTS store_memberships_role_check;

ALTER TABLE store_memberships
  ADD CONSTRAINT store_memberships_role_check
  CHECK (role IN ('manager', 'staff'))
  NOT VALID;

ALTER TABLE store_memberships
  VALIDATE CONSTRAINT store_memberships_role_check;

COMMENT ON COLUMN store_memberships.role IS
  '店舗内での役割。manager = 店長/責任者、staff = 一般担当。';

-- ─── user_id への外部キー制約追加 ────────────────────────────────────────────
-- 既存データが無い前提のため NOT VALID でも即座に VALIDATE が通る。
-- lint-migrations の add-foreign-key-without-not-valid 規約に従う。
ALTER TABLE store_memberships
  DROP CONSTRAINT IF EXISTS store_memberships_user_id_fkey;

ALTER TABLE store_memberships
  ADD CONSTRAINT store_memberships_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE store_memberships
  VALIDATE CONSTRAINT store_memberships_user_id_fkey;

-- ===== re-apply: 20260715000002_billing_analytics_weekly.sql =====
-- billing_analytics_stats に週別集計 (weeks) を追加する。
-- 売上チャートが月別・年別のみだったため、直近12週の週別集計も返す。
-- 引数シグネチャ (uuid, uuid) は変わらないため CREATE OR REPLACE で上書きできる。

create or replace function public.billing_analytics_stats(p_tenant_id uuid, p_customer_id uuid default null)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result json;
  v_today date := current_date;
begin
  with
  month_series as (
    select to_char(gs, 'YYYY-MM') as month_key,
           to_char(gs, 'YYYY') || '年' || extract(month from gs)::int || '月' as label,
           to_char(gs, 'YYYY') as year_key,
           gs::date as month_start
    from generate_series(date_trunc('month', v_today) - interval '11 months', date_trunc('month', v_today), '1 month') gs
  ),
  -- Use documents only (no invoices VIEW to avoid double counting)
  doc_by_month as (
    select to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') as month_key,
           coalesce(sum(coalesce(total, 0)), 0) as total, count(*) as cnt
    from public.documents
    where tenant_id = p_tenant_id and doc_type in ('invoice', 'consolidated_invoice', 'receipt') and status != 'cancelled'
      and (p_customer_id is null or customer_id = p_customer_id)
    group by 1
  ),
  monthly as (
    select ms.month_key, ms.label, ms.year_key,
           coalesce(dm.total, 0) as combined_total, coalesce(dm.cnt, 0) as count
    from month_series ms left join doc_by_month dm on dm.month_key = ms.month_key
  ),
  months_json as (
    select json_agg(json_build_object('month', month_key, 'label', label, 'invoiceTotal', combined_total, 'documentTotal', 0, 'combinedTotal', combined_total, 'count', count) order by month_key) as data from monthly
  ),
  years_json as (
    select json_agg(json_build_object('year', year_key, 'total', year_total, 'count', year_count) order by year_key) as data
    from (select year_key, sum(combined_total) as year_total, sum(count) as year_count from monthly group by year_key) y
  ),
  -- 直近12週の週別集計（月別と同じ構造）。週の開始は date_trunc('week', ...) = 月曜起点。
  week_series as (
    select to_char(gs, 'IYYY-IW') as week_key,
           to_char(gs, 'MM/DD') || '週' as label,
           gs::date as week_start
    from generate_series(date_trunc('week', v_today) - interval '11 weeks', date_trunc('week', v_today), '1 week') gs
  ),
  doc_by_week as (
    select to_char(date_trunc('week', coalesce(issued_at, created_at::date)), 'IYYY-IW') as week_key,
           coalesce(sum(coalesce(total, 0)), 0) as total, count(*) as cnt
    from public.documents
    where tenant_id = p_tenant_id and doc_type in ('invoice', 'consolidated_invoice', 'receipt') and status != 'cancelled'
      and (p_customer_id is null or customer_id = p_customer_id)
      and coalesce(issued_at, created_at::date) >= (date_trunc('week', v_today) - interval '11 weeks')
    group by 1
  ),
  weekly as (
    select ws.week_key, ws.label,
           coalesce(dw.total, 0) as combined_total, coalesce(dw.cnt, 0) as count
    from week_series ws left join doc_by_week dw on dw.week_key = ws.week_key
  ),
  weeks_json as (
    select json_agg(json_build_object('week', week_key, 'label', label, 'combinedTotal', combined_total, 'count', count) order by week_key) as data from weekly
  ),
  current_vals as (
    select coalesce((select combined_total from monthly where month_key = to_char(v_today, 'YYYY-MM')), 0) as cur_total,
           coalesce((select label from monthly where month_key = to_char(v_today, 'YYYY-MM')), '') as cur_label,
           coalesce((select combined_total from monthly where month_key = to_char(v_today - interval '1 month', 'YYYY-MM')), 0) as prev_total,
           coalesce((select label from monthly where month_key = to_char(v_today - interval '1 month', 'YYYY-MM')), '') as prev_label
  ),
  last_year_val as (
    select coalesce(m.combined_total,
      (select coalesce(sum(coalesce(total, 0)), 0) from public.documents where tenant_id = p_tenant_id and doc_type in ('invoice','consolidated_invoice','receipt') and status != 'cancelled'
       and (p_customer_id is null or customer_id = p_customer_id)
       and to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') = to_char(v_today - interval '1 year', 'YYYY-MM'))
    ) as ly_total,
    coalesce(m.label, to_char(v_today - interval '1 year', 'YYYY') || '年' || extract(month from v_today - interval '1 year')::int || '月') as ly_label
    from (select null::bigint as combined_total, null::text as label) dummy
    left join monthly m on m.month_key = to_char(v_today - interval '1 year', 'YYYY-MM')
  ),
  est_pipeline as (
    select coalesce(sum(coalesce(total, 0)), 0) as pipeline
    from public.documents where tenant_id = p_tenant_id and doc_type = 'estimate' and status in ('draft', 'sent')
      and (p_customer_id is null or customer_id = p_customer_id)
  ),
  summary_agg as (
    select coalesce(sum(combined_total), 0) as total_revenue, coalesce(max(combined_total), 1) as max_month_total, coalesce(sum(count), 0) as total_count from monthly
  ),
  -- タブ表示用: 売上（請求書・合算請求書・領収書）実績のある顧客一覧（p_customer_id には依存しない、常にテナント全体から算出）
  customer_totals as (
    select d.customer_id, c.name as customer_name, coalesce(sum(coalesce(d.total, 0)), 0) as total
    from public.documents d
    join public.customers c on c.id = d.customer_id
    where d.tenant_id = p_tenant_id and d.doc_type in ('invoice', 'consolidated_invoice', 'receipt') and d.status != 'cancelled'
      and d.customer_id is not null
    group by d.customer_id, c.name
  ),
  customers_json as (
    select coalesce(json_agg(json_build_object('id', customer_id, 'name', customer_name, 'total', total) order by total desc), '[]'::json) as data
    from customer_totals
  )

  select json_build_object(
    'months', coalesce(mj.data, '[]'::json), 'years', coalesce(yj.data, '[]'::json), 'weeks', coalesce(wj.data, '[]'::json),
    'current', json_build_object('month', cv.cur_total, 'monthLabel', cv.cur_label, 'prevMonth', cv.prev_total, 'prevMonthLabel', cv.prev_label,
      'lastYearSameMonth', lyv.ly_total, 'lastYearLabel', lyv.ly_label,
      'monthGrowthRate', case when cv.prev_total > 0 then round((cv.cur_total - cv.prev_total)::numeric / cv.prev_total::numeric * 100, 2) else null end,
      'yearGrowthRate', case when lyv.ly_total > 0 then round((cv.cur_total - lyv.ly_total)::numeric / lyv.ly_total::numeric * 100, 2) else null end
    ),
    'summary', json_build_object('totalRevenue', sa.total_revenue, 'estimatePipeline', ep.pipeline, 'maxMonthTotal', sa.max_month_total, 'totalCount', sa.total_count),
    'customers', coalesce(cj.data, '[]'::json)
  ) into result
  from months_json mj cross join years_json yj cross join weeks_json wj cross join current_vals cv cross join last_year_val lyv
    cross join est_pipeline ep cross join summary_agg sa cross join customers_json cj;

  return result;
end;
$$;

grant execute on function public.billing_analytics_stats(uuid, uuid) to authenticated;

-- ===== re-apply: 20260715000003_document_templates_staff_invoice.sql =====
-- document_templates.doc_type の CHECK に 'staff_invoice' を追加。
-- DOC_TYPE_LIST（テンプレート編集画面の doc_type セレクト）は既に staff_invoice を
-- 含んでいるため、選択しても保存できない状態を解消する。
ALTER TABLE document_templates
  DROP CONSTRAINT IF EXISTS document_templates_doc_type_check;

ALTER TABLE document_templates
  ADD CONSTRAINT document_templates_doc_type_check
  CHECK (doc_type IS NULL OR doc_type IN (
    'estimate', 'delivery', 'purchase_order', 'order_confirmation',
    'inspection', 'receipt', 'invoice', 'consolidated_invoice', 'staff_invoice'
  ))
  NOT VALID;

ALTER TABLE document_templates
  VALIDATE CONSTRAINT document_templates_doc_type_check;
