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
