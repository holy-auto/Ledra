-- 売上目標 + 達成率
--
-- 背景:
--   ダッシュボード / 経営分析には売上集計・スタッフ別実績は既にあるが、
--   「月初に売上目標を設定 → 達成率をリアルタイム表示」する仕組みが
--   無かった。月次の目標金額を保持するテーブルと、当月の実績（入金済み
--   請求書 + 帳票）を集計して達成率を返す RPC を追加する。
--
-- 実績の定義は management_kpi_stats の all_paid と一致させる:
--   入金済み invoices + 入金済み documents(invoice/consolidated_invoice/receipt)
--   を coalesce(issued_at, created_at) で当月にバケットする。
--   → ダッシュボードの「未回収」「経営分析の入金」と数字がブレない。

-- ─── sales_targets（月次売上目標） ──────────────────────────────────────────
create table if not exists sales_targets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  -- 'YYYY-MM'。当月キーは to_char(now(), 'YYYY-MM') と一致させる。
  year_month    text not null check (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  target_amount bigint not null default 0 check (target_amount >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, year_month)
);

create index if not exists idx_sales_targets_tenant on sales_targets(tenant_id, year_month);

alter table sales_targets enable row level security;

drop policy if exists "sales_targets_select" on sales_targets;
create policy "sales_targets_select" on sales_targets
  for select using (tenant_id in (select my_tenant_ids()));
drop policy if exists "sales_targets_insert" on sales_targets;
create policy "sales_targets_insert" on sales_targets
  for insert with check (tenant_id in (select my_tenant_ids()));
drop policy if exists "sales_targets_update" on sales_targets;
create policy "sales_targets_update" on sales_targets
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));
drop policy if exists "sales_targets_delete" on sales_targets;
create policy "sales_targets_delete" on sales_targets
  for delete using (tenant_id in (select my_tenant_ids()));

drop trigger if exists trg_sales_targets_updated_at on sales_targets;
create trigger trg_sales_targets_updated_at
  before update on sales_targets
  for each row execute function set_updated_at();

comment on table sales_targets is
  '月次の売上目標。当月実績との比較で達成率を出す（sales_target_progress RPC）。';

-- ─── sales_target_progress(p_tenant_id) ──────────────────────────────────────
-- 当月の目標 + 実績 + 達成率を返す。
-- management_kpi_stats と同じ「入金済み」定義で当月実績を集計するため、
-- 経営分析の入金額と整合する。security definer + p_tenant_id 絞り込みは
-- management_kpi_stats と同じ信頼モデル（呼び出し側が caller.tenantId を渡す）。
create or replace function sales_target_progress(p_tenant_id uuid)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end   date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
  v_month_key   text := to_char(current_date, 'YYYY-MM');
  v_target      bigint;
  v_actual      bigint;
begin
  -- SECURITY DEFINER のため RLS を迂回する。呼び出し者が p_tenant_id のメンバーで
  -- ない場合は他テナントの売上目標・入金額を返さない（クロステナント漏洩防止）。
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant_id and user_id = auth.uid()
  ) then
    return json_build_object('month', v_month_key, 'target', 0, 'actual', 0, 'achievementRate', null);
  end if;

  select target_amount into v_target
  from public.sales_targets
  where tenant_id = p_tenant_id and year_month = v_month_key;

  -- 実績は documents のみで集計する。public.invoices は documents(doc_type='invoice')
  -- の互換ビューのため、両方を UNION すると入金済み invoice を二重計上してしまう
  -- （management_kpi_stats の修正 20260323090000 と同じ documents-only 方針）。
  with all_paid as (
    select coalesce(total, 0) as total, coalesce(issued_at::timestamptz, created_at) as effective_date
    from public.documents
    where tenant_id = p_tenant_id and status = 'paid'
      and doc_type in ('invoice', 'consolidated_invoice', 'receipt')
  )
  select coalesce(sum(total), 0) into v_actual
  from all_paid
  where effective_date >= v_month_start
    and effective_date <= v_month_end + interval '23 hours 59 minutes 59 seconds';

  return json_build_object(
    'month', v_month_key,
    'target', coalesce(v_target, 0),
    'actual', coalesce(v_actual, 0),
    'achievementRate', case
      when coalesce(v_target, 0) > 0
        then round(coalesce(v_actual, 0)::numeric / v_target::numeric * 100, 1)
      else null
    end
  );
end;
$$;

grant execute on function sales_target_progress(uuid) to authenticated;
