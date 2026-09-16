-- ============================================================
-- code-review 指摘 (2026-09-09): 20260908131725 で agent_rankings の
-- date/text 型不一致（`>= v_start::text`）を直して実行可能にしたところ、
-- 元から潜んでいた JOIN のファンアウトが実際に発火するようになった。
--
-- agents に agent_referrals（1:N）と agent_commissions（1:N）を同時に
-- LEFT JOIN すると、ある代理店が N件の紹介と M件の手数料行を持つ場合、
-- 直積で N×M 行になる。結果:
--   - count(r.id) が紹介件数を M 倍に誇張する（例: 紹介2件・手数料3件で
--     「紹介6件」と表示される）
--   - sum(c.amount) が手数料を N 倍に誇張する
-- 順位表示・成約率・手数料総額のいずれも壊れる。
--
-- 紹介・手数料をそれぞれ agent_id で集計してから agents に JOIN する形に
-- 直し、ファンアウトを無くす。
-- ============================================================

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
      coalesce(r.referral_count, 0) as referral_count,
      coalesce(r.contracted_count, 0) as contracted_count,
      case when coalesce(r.referral_count, 0) > 0
        then round(coalesce(r.contracted_count, 0)::numeric / r.referral_count * 100, 1)
        else 0 end as conversion_rate,
      case when a.id in (select agent_id from public.agent_users where user_id = auth.uid() and is_active)
        then coalesce(c.total_commission, 0) else null end as total_commission
    from public.agents a
    left join (
      select
        agent_id,
        count(*) as referral_count,
        count(*) filter (where status = 'contracted') as contracted_count
      from public.agent_referrals
      where created_at >= v_start
      group by agent_id
    ) r on r.agent_id = a.id
    left join (
      select agent_id, sum(amount) filter (where status in ('approved', 'paid')) as total_commission
      from public.agent_commissions
      where period_start >= v_start
      group by agent_id
    ) c on c.agent_id = a.id
    where a.status = 'active'
  ) t;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;
