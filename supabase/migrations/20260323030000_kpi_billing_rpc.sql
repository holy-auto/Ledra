-- =============================================================
-- RPC functions for management KPI and billing analytics
-- Replaces full-table JS fetches with DB-side aggregation
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. management_kpi_stats(p_tenant_id uuid)
-- ─────────────────────────────────────────────────────────────
create or replace function management_kpi_stats(p_tenant_id uuid)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result json;
  v_now timestamptz := now();
  v_today date := current_date;
  v_this_month_start date;
  v_this_month_end date;
  v_last_month_start date;
  v_last_month_end date;
  v_three_months_ago date;
  v_next_month_end date;
begin
  v_this_month_start := date_trunc('month', v_today)::date;
  v_this_month_end := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
  v_last_month_start := (date_trunc('month', v_today) - interval '1 month')::date;
  v_last_month_end := (date_trunc('month', v_today) - interval '1 day')::date;
  v_three_months_ago := (date_trunc('month', v_today) - interval '3 months')::date;
  v_next_month_end := (date_trunc('month', v_today) + interval '2 months' - interval '1 day')::date;

  with
  -- ── Base data CTEs ──
  inv as (
    select id, coalesce(total, 0) as total, status, issued_at, due_date, customer_id, created_at
    from public.invoices
    where tenant_id = p_tenant_id
  ),
  doc as (
    select id, coalesce(total, 0) as total, status, doc_type, issued_at, due_date, customer_id, created_at, source_document_id
    from public.documents
    where tenant_id = p_tenant_id
  ),
  cust as (
    select id, created_at
    from public.customers
    where tenant_id = p_tenant_id
  ),
  cert as (
    select id, status, service_price, customer_id, created_at
    from public.certificates
    where tenant_id = p_tenant_id
  ),
  po as (
    select id, coalesce(total, 0) as total, status, issued_at, created_at
    from public.documents
    where tenant_id = p_tenant_id
      and doc_type = 'purchase_order'
      and status != 'cancelled'
  ),

  -- ── Cash Flow ──
  paid_inv as (
    select total, issued_at, created_at from inv where status = 'paid'
  ),
  paid_doc_inv as (
    select total, issued_at, created_at from doc
    where status = 'paid' and doc_type in ('invoice', 'consolidated_invoice', 'receipt')
  ),
  all_paid as (
    select total, coalesce(issued_at::timestamptz, created_at) as effective_date from paid_inv
    union all
    select total, coalesce(issued_at::timestamptz, created_at) as effective_date from paid_doc_inv
  ),
  cash_in_agg as (
    select
      coalesce(sum(total), 0) as total_cash_in,
      coalesce(sum(case when effective_date >= v_this_month_start and effective_date <= v_this_month_end + interval '23 hours 59 minutes 59 seconds' then total else 0 end), 0) as this_month_cash_in,
      coalesce(sum(case when effective_date >= v_last_month_start and effective_date <= v_last_month_end + interval '23 hours 59 minutes 59 seconds' then total else 0 end), 0) as last_month_cash_in
    from all_paid
  ),

  -- AR (Accounts Receivable)
  ar_inv as (
    select total, due_date from inv where status in ('sent', 'overdue')
  ),
  ar_doc as (
    select total, due_date from doc
    where status in ('sent', 'accepted') and doc_type in ('invoice', 'consolidated_invoice')
  ),
  ar_agg as (
    select
      coalesce(sum(total), 0) as total_ar
    from (
      select total, due_date from ar_inv
      union all
      select total, due_date from ar_doc
    ) ar_all
  ),
  upcoming_ar_agg as (
    select coalesce(sum(total), 0) as upcoming_ar
    from ar_inv
    where due_date is not null and due_date <= v_next_month_end
  ),

  -- Cash Out (purchase orders, non-draft)
  po_all as (
    select total, coalesce(issued_at::timestamptz, created_at) as effective_date, status
    from po
  ),
  cash_out_agg as (
    select
      coalesce(sum(case when status != 'draft' then total else 0 end), 0) as total_cash_out,
      coalesce(sum(case when status != 'draft' and effective_date >= v_this_month_start and effective_date <= v_this_month_end + interval '23 hours 59 minutes 59 seconds' then total else 0 end), 0) as this_month_cash_out,
      coalesce(sum(case when status != 'draft' and effective_date >= v_last_month_start and effective_date <= v_last_month_end + interval '23 hours 59 minutes 59 seconds' then total else 0 end), 0) as last_month_cash_out
    from po_all
  ),

  -- ── Collection Rate ──
  collection_agg as (
    select
      coalesce(sum(case when status not in ('cancelled', 'draft') then total else 0 end), 0) as total_invoiced,
      coalesce(sum(case when status = 'paid' then total else 0 end), 0) as total_paid,
      count(case when status = 'overdue' then 1 end) as overdue_count,
      coalesce(sum(case when status = 'overdue' then total else 0 end), 0) as overdue_amount
    from inv
  ),

  -- ── DSO ──
  recent_rev as (
    select coalesce(sum(total), 0) as rev_3m
    from inv
    where coalesce(issued_at::timestamptz, created_at) >= v_three_months_ago
      and status != 'cancelled'
  ),

  -- ── ARPU ──
  active_customers as (
    select distinct customer_id
    from (
      select customer_id from inv where customer_id is not null and status != 'cancelled'
      union
      select customer_id from doc where customer_id is not null and status != 'cancelled'
        and doc_type in ('invoice', 'consolidated_invoice', 'receipt')
    ) ac
  ),
  total_revenue_agg as (
    select
      coalesce(sum(total), 0) as total_rev
    from (
      select total from inv where status != 'cancelled'
      union all
      select total from doc where status != 'cancelled' and doc_type in ('invoice', 'consolidated_invoice', 'receipt')
    ) tr
  ),
  total_purchases_agg as (
    select coalesce(sum(total), 0) as total_purchases
    from po
  ),

  -- ── Conversion Rate ──
  estimates as (
    select id, status, source_document_id from doc
    where doc_type = 'estimate' and status != 'cancelled'
  ),
  accepted_est_ids as (
    select id from estimates where status in ('accepted', 'paid')
  ),
  linked_est_ids as (
    select distinct d.source_document_id as id
    from doc d
    inner join estimates e on e.id = d.source_document_id
    where d.doc_type in ('invoice', 'consolidated_invoice')
      and d.source_document_id is not null
  ),
  converted_est as (
    select id from accepted_est_ids
    union
    select id from linked_est_ids
  ),

  -- ── Customer Growth (12 months) ──
  month_series as (
    select
      to_char(gs, 'YYYY-MM') as month_key,
      extract(month from gs)::int as m_num,
      gs::date as month_start
    from generate_series(
      date_trunc('month', v_today) - interval '11 months',
      date_trunc('month', v_today),
      '1 month'
    ) gs
  ),
  cust_by_month as (
    select
      to_char(created_at, 'YYYY-MM') as month_key,
      count(*) as cnt
    from cust
    where created_at is not null
    group by 1
  ),
  before_window_count as (
    select count(*) as cnt
    from cust
    where created_at is not null
      and to_char(created_at, 'YYYY-MM') < (select min(month_key) from month_series)
  ),
  customer_growth as (
    select json_agg(
      json_build_object(
        'month', ms.month_key,
        'label', ms.m_num || '月',
        'count', coalesce(cm.cnt, 0),
        'cumulative', coalesce(bw.cnt, 0) + coalesce(sum(coalesce(cm.cnt, 0)) over (order by ms.month_key), 0)
      ) order by ms.month_key
    ) as data
    from month_series ms
    left join cust_by_month cm on cm.month_key = ms.month_key
    cross join before_window_count bw
  ),

  -- ── Certificate by month (12 months) ──
  cert_by_month as (
    select
      to_char(created_at, 'YYYY-MM') as month_key,
      count(*) as cnt
    from cert
    where created_at is not null
    group by 1
  ),
  cert_growth as (
    select json_agg(
      json_build_object(
        'month', ms.month_key,
        'label', ms.m_num || '月',
        'count', coalesce(cb.cnt, 0)
      ) order by ms.month_key
    ) as data
    from month_series ms
    left join cert_by_month cb on cb.month_key = ms.month_key
  ),

  -- ── LTV ──
  cust_first_last as (
    select
      customer_id,
      min(coalesce(issued_at::timestamptz, created_at)) as first_date,
      max(coalesce(issued_at::timestamptz, created_at)) as last_date
    from inv
    where customer_id is not null and status != 'cancelled'
    group by customer_id
  ),
  ltv_agg as (
    select
      count(*) as cust_with_data,
      coalesce(sum(
        (extract(year from last_date) - extract(year from first_date)) * 12
        + (extract(month from last_date) - extract(month from first_date))
        + 1
      ), 0) as total_month_span
    from cust_first_last
  )

  -- ── Build result ──
  select json_build_object(
    'cashFlow', json_build_object(
      'totalCashIn', ci.total_cash_in,
      'totalCashOut', co.total_cash_out,
      'operatingCF', ci.total_cash_in - co.total_cash_out,
      'thisMonth', json_build_object(
        'cashIn', ci.this_month_cash_in,
        'cashOut', co.this_month_cash_out,
        'cf', ci.this_month_cash_in - co.this_month_cash_out
      ),
      'lastMonth', json_build_object(
        'cashIn', ci.last_month_cash_in,
        'cashOut', co.last_month_cash_out,
        'cf', ci.last_month_cash_in - co.last_month_cash_out
      ),
      'cfGrowthRate', case
        when (ci.last_month_cash_in - co.last_month_cash_out) != 0
        then round(
          ((ci.this_month_cash_in - co.this_month_cash_out) - (ci.last_month_cash_in - co.last_month_cash_out))::numeric
          / abs((ci.last_month_cash_in - co.last_month_cash_out))::numeric * 100, 2
        )
        else null
      end,
      'accountsReceivable', ar.total_ar,
      'upcomingAR', uar.upcoming_ar
    ),
    'collection', json_build_object(
      'totalInvoiced', col.total_invoiced,
      'totalPaid', col.total_paid,
      'collectionRate', case when col.total_invoiced > 0 then round(col.total_paid::numeric / col.total_invoiced::numeric * 100, 2) else null end,
      'overdueCount', col.overdue_count,
      'overdueAmount', col.overdue_amount,
      'dso', case when rr.rev_3m / 3.0 > 0 then round(ar.total_ar::numeric / (rr.rev_3m::numeric / 3.0) * 30) else null end
    ),
    'customers', json_build_object(
      'total', (select count(*) from cust),
      'activeCustomers', (select count(*) from active_customers),
      'arpu', case when (select count(*) from active_customers) > 0
        then round(tr.total_rev::numeric / (select count(*) from active_customers)::numeric)
        else null end,
      'ltv', case
        when la.cust_with_data > 0 and (select count(*) from active_customers) > 0
        then round(tr.total_rev::numeric / (select count(*) from active_customers)::numeric)
        else case when (select count(*) from active_customers) > 0
          then round(tr.total_rev::numeric / (select count(*) from active_customers)::numeric)
          else null end
      end,
      'avgLifeMonths', case when la.cust_with_data > 0
        then round((la.total_month_span::numeric / la.cust_with_data::numeric) * 10) / 10
        else 0 end,
      'growthByMonth', coalesce(cg.data, '[]'::json)
    ),
    'profitability', json_build_object(
      'totalRevenue', tr.total_rev,
      'totalPurchases', tp.total_purchases,
      'grossProfit', tr.total_rev - tp.total_purchases,
      'grossMarginRate', case when tr.total_rev > 0
        then round((tr.total_rev - tp.total_purchases)::numeric / tr.total_rev::numeric * 100, 2)
        else null end
    ),
    'conversion', json_build_object(
      'totalEstimates', (select count(*) from estimates),
      'convertedEstimates', (select count(*) from converted_est),
      'conversionRate', case when (select count(*) from estimates) > 0
        then round((select count(*) from converted_est)::numeric / (select count(*) from estimates)::numeric * 100, 2)
        else null end
    ),
    'certificates', json_build_object(
      'total', (select count(*) from cert),
      'active', (select count(*) from cert where status = 'active'),
      'byMonth', coalesce(ceg.data, '[]'::json),
      'avgServicePrice', case
        when (select count(*) from cert where service_price is not null and service_price > 0) > 0
        then round(
          (select sum(service_price) from cert where service_price is not null and service_price > 0)::numeric
          / (select count(*) from cert where service_price is not null and service_price > 0)::numeric
        )
        else null end
    )
  ) into result
  from cash_in_agg ci
  cross join cash_out_agg co
  cross join ar_agg ar
  cross join upcoming_ar_agg uar
  cross join collection_agg col
  cross join recent_rev rr
  cross join total_revenue_agg tr
  cross join total_purchases_agg tp
  cross join ltv_agg la
  cross join customer_growth cg
  cross join cert_growth ceg;

  return result;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. billing_analytics_stats(p_tenant_id uuid)
-- ─────────────────────────────────────────────────────────────
create or replace function billing_analytics_stats(p_tenant_id uuid)
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
    select
      to_char(gs, 'YYYY-MM') as month_key,
      to_char(gs, 'YYYY') || '年' || extract(month from gs)::int || '月' as label,
      to_char(gs, 'YYYY') as year_key,
      gs::date as month_start,
      (gs + interval '1 month' - interval '1 day')::date as month_end
    from generate_series(
      date_trunc('month', v_today) - interval '11 months',
      date_trunc('month', v_today),
      '1 month'
    ) gs
  ),

  -- Invoice totals by month (non-cancelled)
  inv_by_month as (
    select
      to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') as month_key,
      coalesce(sum(coalesce(total, 0)), 0) as total,
      count(*) as cnt
    from public.invoices
    where tenant_id = p_tenant_id
      and status != 'cancelled'
    group by 1
  ),

  -- Document totals by month (invoice/receipt types, non-cancelled)
  doc_by_month as (
    select
      to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') as month_key,
      coalesce(sum(coalesce(total, 0)), 0) as total,
      count(*) as cnt
    from public.documents
    where tenant_id = p_tenant_id
      and doc_type in ('invoice', 'consolidated_invoice', 'receipt')
      and status != 'cancelled'
    group by 1
  ),

  -- Monthly data
  monthly as (
    select
      ms.month_key,
      ms.label,
      ms.year_key,
      coalesce(im.total, 0) as invoice_total,
      coalesce(dm.total, 0) as document_total,
      coalesce(im.total, 0) + coalesce(dm.total, 0) as combined_total,
      coalesce(im.cnt, 0) + coalesce(dm.cnt, 0) as count
    from month_series ms
    left join inv_by_month im on im.month_key = ms.month_key
    left join doc_by_month dm on dm.month_key = ms.month_key
  ),

  -- Months JSON array
  months_json as (
    select json_agg(
      json_build_object(
        'month', month_key,
        'label', label,
        'invoiceTotal', invoice_total,
        'documentTotal', document_total,
        'combinedTotal', combined_total,
        'count', count
      ) order by month_key
    ) as data
    from monthly
  ),

  -- Years aggregation
  years_json as (
    select json_agg(
      json_build_object(
        'year', year_key,
        'total', year_total,
        'count', year_count
      ) order by year_key
    ) as data
    from (
      select year_key, sum(combined_total) as year_total, sum(count) as year_count
      from monthly
      group by year_key
    ) y
  ),

  -- Current & previous month
  current_month_key as (
    select to_char(v_today, 'YYYY-MM') as ck
  ),
  prev_month_key as (
    select to_char(v_today - interval '1 month', 'YYYY-MM') as pk
  ),
  current_vals as (
    select
      coalesce((select combined_total from monthly where month_key = (select ck from current_month_key)), 0) as cur_total,
      coalesce((select label from monthly where month_key = (select ck from current_month_key)), '') as cur_label,
      coalesce((select combined_total from monthly where month_key = (select pk from prev_month_key)), 0) as prev_total,
      coalesce((select label from monthly where month_key = (select pk from prev_month_key)), '') as prev_label
  ),

  -- Last year same month
  last_year_key as (
    select to_char(v_today - interval '1 year', 'YYYY-MM') as lyk
  ),
  last_year_val as (
    select
      coalesce(m.combined_total, ly_calc.total) as ly_total,
      coalesce(m.label,
        to_char(v_today - interval '1 year', 'YYYY') || '年' || extract(month from v_today - interval '1 year')::int || '月'
      ) as ly_label
    from last_year_key lyk
    left join monthly m on m.month_key = lyk.lyk
    left join lateral (
      select coalesce(sum(coalesce(i.total, 0)), 0) + coalesce(sum(coalesce(d.total, 0)), 0) as total
      from (
        select total from public.invoices
        where tenant_id = p_tenant_id
          and status != 'cancelled'
          and to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') = lyk.lyk
      ) i
      full outer join (
        select total from public.documents
        where tenant_id = p_tenant_id
          and doc_type in ('invoice', 'consolidated_invoice', 'receipt')
          and status != 'cancelled'
          and to_char(coalesce(issued_at, created_at::date), 'YYYY-MM') = lyk.lyk
      ) d on false
    ) ly_calc on m.combined_total is null
  ),

  -- Estimate pipeline
  est_pipeline as (
    select coalesce(sum(coalesce(total, 0)), 0) as pipeline
    from public.documents
    where tenant_id = p_tenant_id
      and doc_type = 'estimate'
      and status != 'cancelled'
      and status in ('draft', 'sent')
  ),

  -- Summary totals
  summary_agg as (
    select
      coalesce(sum(combined_total), 0) as total_revenue,
      coalesce(max(combined_total), 1) as max_month_total,
      coalesce(sum(count), 0) as total_count
    from monthly
  )

  select json_build_object(
    'months', coalesce(mj.data, '[]'::json),
    'years', coalesce(yj.data, '[]'::json),
    'current', json_build_object(
      'month', cv.cur_total,
      'monthLabel', cv.cur_label,
      'prevMonth', cv.prev_total,
      'prevMonthLabel', cv.prev_label,
      'lastYearSameMonth', lyv.ly_total,
      'lastYearLabel', lyv.ly_label,
      'monthGrowthRate', case when cv.prev_total > 0
        then round((cv.cur_total - cv.prev_total)::numeric / cv.prev_total::numeric * 100, 2)
        else null end,
      'yearGrowthRate', case when lyv.ly_total > 0
        then round((cv.cur_total - lyv.ly_total)::numeric / lyv.ly_total::numeric * 100, 2)
        else null end
    ),
    'summary', json_build_object(
      'totalRevenue', sa.total_revenue,
      'estimatePipeline', ep.pipeline,
      'maxMonthTotal', sa.max_month_total,
      'totalCount', sa.total_count
    )
  ) into result
  from months_json mj
  cross join years_json yj
  cross join current_vals cv
  cross join last_year_val lyv
  cross join est_pipeline ep
  cross join summary_agg sa;

  return result;
end;
$$;
