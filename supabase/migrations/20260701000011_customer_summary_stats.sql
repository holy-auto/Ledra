-- 顧客サマリー集計を 1 本の RPC に集約する。
--
-- 背景:
--   /api/admin/customers/[id]/summary は 5 本のクエリ (証明書 count ×2 / 車両 count /
--   請求書 SELECT→JS reduce / 最終来店) を並列実行していた。さらに請求書の合計は
--   存在しない列 `total_amount` を select していたため、PostgREST がエラーを返し
--   total_invoices / total_spent が常に 0 になる潜在バグがあった (正しい列は documents.total)。
--
--   本 RPC は正しい列 `total` で集計し、5 本の往復を 1 本に畳む。行は転送せず
--   count/sum/max だけを返す。フロントに渡す stats の shape は不変。
--
-- 設計:
--   dashboard_unpaid_invoice_totals と同じく INVOKER (caller ロール) 実行。tenant_id と
--   customer_id を引数で必須にし、テナント越境を防ぐ。search_path を空に固定し全参照を
--   スキーマ修飾する (function_search_path_mutable 対策)。

create or replace function public.customer_summary_stats(p_tenant_id uuid, p_customer_id uuid)
returns table (
  total_certificates bigint,
  active_certificates bigint,
  total_vehicles bigint,
  total_invoices bigint,
  total_spent bigint,
  last_visit timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*)
       from public.certificates c
      where c.tenant_id = p_tenant_id and c.customer_id = p_customer_id)::bigint,
    (select count(*)
       from public.certificates c
      where c.tenant_id = p_tenant_id and c.customer_id = p_customer_id and c.status = 'active')::bigint,
    (select count(*)
       from public.vehicles v
      where v.tenant_id = p_tenant_id and v.customer_id = p_customer_id)::bigint,
    (select count(*)
       from public.documents d
      where d.tenant_id = p_tenant_id and d.customer_id = p_customer_id
        and d.doc_type in ('invoice', 'consolidated_invoice'))::bigint,
    (select coalesce(sum(d.total), 0)
       from public.documents d
      where d.tenant_id = p_tenant_id and d.customer_id = p_customer_id
        and d.doc_type in ('invoice', 'consolidated_invoice'))::bigint,
    (select max(c.created_at)
       from public.certificates c
      where c.tenant_id = p_tenant_id and c.customer_id = p_customer_id);
$$;

comment on function public.customer_summary_stats(uuid, uuid) is
  '顧客サマリー (証明書/車両/請求書の件数・合計・最終来店) を 1 本で集約。/api/admin/customers/[id]/summary 用。';

grant execute on function public.customer_summary_stats(uuid, uuid) to anon, authenticated, service_role;
