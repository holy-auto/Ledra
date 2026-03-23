-- Consolidated RPC for dashboard tenant stats
-- Replaces 7 separate queries with a single function call
create or replace function dashboard_tenant_stats(p_tenant_id uuid)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result json;
  v_today date := current_date;
begin
  select json_build_object(
    'total_certs', (select count(*) from public.certificates where tenant_id = p_tenant_id),
    'active_certs', (select count(*) from public.certificates where tenant_id = p_tenant_id and status = 'active'),
    'void_certs', (select count(*) from public.certificates where tenant_id = p_tenant_id and status = 'void'),
    'member_count', (select count(*) from public.tenant_memberships where tenant_id = p_tenant_id),
    'customer_count', (select count(*) from public.customers where tenant_id = p_tenant_id),
    'invoice_count', (select count(*) from public.invoices where tenant_id = p_tenant_id),
    'unpaid_amount', (select coalesce(sum(total), 0) from public.invoices where tenant_id = p_tenant_id and status in ('sent', 'overdue')),
    'today_reservations', (select count(*) from public.reservations where tenant_id = p_tenant_id and scheduled_date = v_today and status != 'cancelled'),
    'active_reservations', (select count(*) from public.reservations where tenant_id = p_tenant_id and status in ('confirmed', 'arrived', 'in_progress')),
    'active_orders', (select count(*) from public.job_orders where (from_tenant_id = p_tenant_id or to_tenant_id = p_tenant_id) and status in ('pending', 'accepted', 'in_progress')),
    'status_breakdown', (select coalesce(json_agg(row_to_json(s)), '[]'::json) from (select status, count(*) as count from public.certificates where tenant_id = p_tenant_id group by status) s),
    'recent_activity', (select coalesce(json_agg(row_to_json(d) order by d.date), '[]'::json) from (
      select ds::date::text as date, count(c.id) as count
      from generate_series(current_date - interval '29 days', current_date, '1 day') ds
      left join public.certificates c on c.tenant_id = p_tenant_id and c.created_at::date = ds::date
      group by ds
    ) d)
  ) into result;

  return result;
end;
$$;
