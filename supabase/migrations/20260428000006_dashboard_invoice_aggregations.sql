-- Dashboard aggregation: unpaid invoice count + sum.
--
-- 背景:
--   `dashboard-summary` ルートは未回収請求 (status in (sent, overdue)) を
--   全件 SELECT で取得し、JS 側で reduce していた。テナント当たり数千行
--   ある中堅店舗で 50ms+, 大手で 500ms+ の遅延を生む。集計を SQL に
--   寄せ、行は転送せず count + sum だけ返す。
--
--   apiJson 側はこの戻り値 { unpaid_count, unpaid_amount } をそのまま
--   使うため後方互換でフロントの shape は変わらない。
--
-- 設計:
--   SECURITY DEFINER ではなく INVOKER (= caller のロール) で実行する。
--   service_role / authenticated 両方のクライアントから呼べるよう
--   PUBLIC への EXECUTE 権限を付与する。tenant_id は引数で必須。

create or replace function public.dashboard_unpaid_invoice_totals(p_tenant_id uuid)
returns table (
  unpaid_count bigint,
  unpaid_amount bigint,
  overdue_count bigint
)
language sql
stable
as $$
  select
    count(*) filter (where status in ('sent', 'overdue'))::bigint as unpaid_count,
    coalesce(sum(total) filter (where status in ('sent', 'overdue')), 0)::bigint as unpaid_amount,
    count(*) filter (where status = 'overdue')::bigint as overdue_count
  from public.documents
  where tenant_id = p_tenant_id
    and doc_type = 'invoice';
$$;

comment on function public.dashboard_unpaid_invoice_totals(uuid) is
  'Aggregate unpaid + overdue invoice totals for a tenant. Used by /api/admin/dashboard-summary to avoid pulling unpaid rows into JS.';

grant execute on function public.dashboard_unpaid_invoice_totals(uuid) to anon, authenticated, service_role;
