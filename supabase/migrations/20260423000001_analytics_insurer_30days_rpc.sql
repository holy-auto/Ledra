-- =============================================================
-- analytics_insurer_30days RPC
-- =============================================================
-- 背景:
--   /api/insurer/analytics は 30 日分の insurer_access_logs を 3 回個別に
--   SELECT して Node.js 側で集計していた。行数が増えるとメモリを圧迫し、
--   Vercel Function の 512MB 上限に接近するため、集計を Postgres 側に
--   押し出してレスポンスは JSON 1 本で返す。
--
-- 仕様:
--   - p_insurer_id に一致する insurer_access_logs を対象にする
--   - p_days に指定した日数（default 30）の範囲で集計
--   - 戻り値は 3 つの配列をまとめた JSON オブジェクト:
--       {
--         "daily_counts": [{ "date": "2026-04-01", "count": 12 }, ...],
--         "top_keywords": [{ "keyword": "honda", "count": 5 }, ...],
--         "action_breakdown": [{ "action": "search", "count": 42 }, ...]
--       }
--   - daily_counts は「欠落日 = 0」も含めて等間隔で返す (アプリ側での
--     埋め直し処理を不要にする)
--   - top_keywords は meta->>'query' を lower(trim()) して集計、上位 10 件
--   - action_breakdown は action ごとの件数を降順
--
-- セキュリティ:
--   - p_insurer_id を NULL にしたら空集合を返す (abuse 防止)
--   - SECURITY DEFINER は使わない。呼び出し元 (admin client) は
--     service-role なので row-level security は効かないが、関数自体は
--     insurer_id を引数として強制的に受け取るので、引数の貫通さえ
--     守れば cross-insurer リークは起きない。
-- =============================================================

create or replace function analytics_insurer_30days(
  p_insurer_id uuid,
  p_days       int default 30
)
returns jsonb
language sql
stable
as $$
with params as (
  select
    p_insurer_id as insurer_id,
    greatest(coalesce(p_days, 30), 1) as days,
    (now() at time zone 'utc')::date as today
),
window_logs as (
  select
    ial.created_at::date as day,
    ial.action,
    ial.meta
  from insurer_access_logs ial, params p
  where p.insurer_id is not null
    and ial.insurer_id = p.insurer_id
    and ial.created_at >= (p.today - (p.days - 1))::timestamptz
),
daily as (
  select
    to_char(d::date, 'YYYY-MM-DD') as date,
    coalesce(c.cnt, 0)::int       as count
  from params p
  cross join lateral generate_series(
    (p.today - (p.days - 1))::date,
    p.today::date,
    interval '1 day'
  ) as d
  left join (
    select day, count(*)::int as cnt
    from window_logs
    group by day
  ) c on c.day = d::date
  order by d
),
keywords as (
  select
    lower(btrim(meta->>'query')) as keyword,
    count(*)::int               as count
  from window_logs
  where action = 'search'
    and meta ? 'query'
    and length(btrim(meta->>'query')) > 0
  group by 1
  order by count desc, keyword asc
  limit 10
),
actions as (
  select
    coalesce(nullif(action, ''), 'unknown') as action,
    count(*)::int                           as count
  from window_logs
  group by 1
  order by count desc, action asc
)
select jsonb_build_object(
  'daily_counts',     coalesce((select jsonb_agg(jsonb_build_object('date', date, 'count', count)) from daily), '[]'::jsonb),
  'top_keywords',     coalesce((select jsonb_agg(jsonb_build_object('keyword', keyword, 'count', count)) from keywords), '[]'::jsonb),
  'action_breakdown', coalesce((select jsonb_agg(jsonb_build_object('action', action, 'count', count)) from actions), '[]'::jsonb)
);
$$;

comment on function analytics_insurer_30days(uuid, int) is
  'Aggregate insurer_access_logs for the given insurer over the last N days (default 30). '
  'Returns { daily_counts, top_keywords, action_breakdown } as a single jsonb object.';
