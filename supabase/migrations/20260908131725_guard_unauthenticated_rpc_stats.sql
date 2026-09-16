-- ============================================================
-- G-M1 / G-M2 / G-L1 是正: 呼び出し元検証の無い統計・ランキング RPC に
-- テナント所属 / 代理店所属 / プラットフォーム管理者チェックを追加
--
-- 監査 2026-09-08 (Medium/Low): 以下の SECURITY DEFINER 関数は authenticated
-- ロールから直接 /rest/v1/rpc/ 経由で実行でき、本体に呼び出し元検証が無かった。
--
--   - dashboard_tenant_stats(p_tenant_id): 引数の tenant_id だけで他テナントの
--     証明書数・顧客数・未払金額・当日予約数を取得できた (Medium)。
--   - agent_rankings(p_period): 全代理店の実名・紹介件数・手数料総額を任意の
--     authenticated ユーザーに返していた。API 側 (src/app/api/agent/rankings)
--     の匿名化は RPC を直接叩けば迂回できた (Medium)。
--   - platform_agent_count / platform_certificate_stats / platform_insurer_count /
--     platform_regional_stats / platform_tenant_category_stats: 事業指標
--     （テナント数・都道府県分布・証明書総数）が authenticated から漏れていた (Low)。
--
-- CREATE OR REPLACE は grant/ACL を保持するが、proconfig (search_path) は
-- 明示し直さないとリセットされる（実測で確認済み）。dashboard_tenant_stats /
-- platform_* は元々 search_path = '' だったのでそのまま維持。agent_rankings は
-- 元々 `public, extensions, pg_temp`（非空）だったが、ここで touch するついでに
-- 全テーブル参照を public. 修飾して search_path = '' に強化する
-- （lint-migrations の security-definer-mutable-search-path ルール要求）。
-- ============================================================

-- ── dashboard_tenant_stats: 呼び出し元がそのテナントの所属メンバーであることを要求 ──
create or replace function public.dashboard_tenant_stats(p_tenant_id uuid)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result json;
  v_today date := current_date;
begin
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden: not a member of this tenant';
  end if;

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

-- ── agent_rankings: 呼び出し元がアクティブな代理店ユーザーであることを要求。
--    他代理店の実名・手数料総額は自分の分以外 null にする（API 側の匿名化を
--    RPC 直叩きで迂回できないようにする）。件数・成約率は引き続き全代理店分を返す
--    （順位表示に必要で、個社が特定できる情報ではない）。
--
--    ついでに発見・修正: `agent_commissions.period_start` は date 列なのに
--    元の本体は `>= v_start::text` と date/text を比較しており、この JOIN
--    条件は型解決で必ず失敗する（実測で確認 — 呼び出しは常に
--    "operator does not exist: date >= text" で例外になっていた）。
--    今回の書き換えのついでに `v_start::text` → `v_start` に直す。 ──
create or replace function public.agent_rankings(p_period text default 'month')
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_start date;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.agent_users where user_id = auth.uid() and is_active
  ) then
    raise exception 'forbidden: active agent user required';
  end if;

  if p_period = 'month' then
    v_start := date_trunc('month', now())::date;
  elsif p_period = 'quarter' then
    v_start := date_trunc('quarter', now())::date;
  elsif p_period = 'year' then
    v_start := date_trunc('year', now())::date;
  else
    v_start := date_trunc('month', now())::date;
  end if;

  select jsonb_agg(row_to_json(t)::jsonb order by t.referral_count desc)
  into v_result
  from (
    select
      a.id as agent_id,
      case when a.id in (select agent_id from public.agent_users where user_id = auth.uid() and is_active)
        then a.name else null end as agent_name,
      count(r.id) as referral_count,
      count(r.id) filter (where r.status = 'contracted') as contracted_count,
      case when count(r.id) > 0
        then round(count(r.id) filter (where r.status = 'contracted')::numeric / count(r.id) * 100, 1)
        else 0 end as conversion_rate,
      case when a.id in (select agent_id from public.agent_users where user_id = auth.uid() and is_active)
        then coalesce(sum(c.amount) filter (where c.status in ('approved','paid')), 0) else null end as total_commission
    from public.agents a
    left join public.agent_referrals r on r.agent_id = a.id and r.created_at >= v_start
    left join public.agent_commissions c on c.agent_id = a.id and c.period_start >= v_start
    where a.status = 'active'
    group by a.id, a.name
  ) t;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- ── platform_* 統計 5 関数: プラットフォーム管理者のみに限定 ──
create or replace function public.platform_agent_count()
returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin_user() then
    raise exception 'forbidden: platform admin required';
  end if;
  return (select count(*) from public.agents);
end;
$$;

create or replace function public.platform_certificate_stats()
returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  result json;
begin
  if not public.is_super_admin_user() then
    raise exception 'forbidden: platform admin required';
  end if;

  select json_build_object(
    'total', count(*),
    'active', count(*) filter (where status::text = 'active'),
    'void', count(*) filter (where status::text = 'void'),
    'expired', count(*) filter (where status::text = 'expired'),
    'draft', count(*) filter (where status::text = 'draft')
  ) into result
  from public.certificates;
  return result;
end;
$$;

create or replace function public.platform_insurer_count()
returns bigint
language plpgsql stable security definer
set search_path to ''
as $$
begin
  if not public.is_super_admin_user() then
    raise exception 'forbidden: platform admin required';
  end if;
  return (select count(*) from public.insurers);
end;
$$;

create or replace function public.platform_regional_stats()
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not public.is_super_admin_user() then
    raise exception 'forbidden: platform admin required';
  end if;

  select json_agg(row_to_json(r)) into result
  from (
    select coalesce(prefecture, '未設定') as prefecture, count(*) as count
    from public.tenants where is_active = true group by prefecture order by count desc
  ) r;
  return coalesce(result, '[]'::json);
end;
$$;

create or replace function public.platform_tenant_category_stats()
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not public.is_super_admin_user() then
    raise exception 'forbidden: platform admin required';
  end if;

  select json_agg(row_to_json(r)) into result
  from (
    select coalesce(category, 'unset') as category, count(*) as count
    from public.tenants where is_active = true group by category order by count desc
  ) r;
  return coalesce(result, '[]'::json);
end;
$$;
