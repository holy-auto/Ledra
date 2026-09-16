-- ============================================================
-- 20260908131725 のコードレビュー指摘の是正: platform_* 統計 5 関数の
-- is_super_admin_user() ガードが、公開マーケティングページ
-- (src/lib/marketing/network.ts) からの service_role 呼び出しまで
-- 弾いてしまっていた。
--
-- src/lib/marketing/network.ts は createServiceRoleAdmin() で
-- platform_regional_stats() を呼ぶ（未ログインの公開 /network ページの
-- 集計）。service_role 接続には auth.uid() が無い（NULL）ため、
-- is_super_admin_user() は常に false を返し、常に forbidden 例外になる。
--
-- auth.role() = 'service_role' は JWT の改ざん不能なロールクレームで、
-- 本リポジトリの他の RLS policy でも同じ判定を使っている（例:
-- 20260403000000_add_electronic_signature.sql）。service_role は既に
-- RLS を BYPASSRLS で無視できる特権ロールなので、この判定を SECURITY
-- DEFINER 関数の中で追加しても防御レベルは下がらない。
--
-- `coalesce(auth.role(), '')` で包む: PL/pgSQL の `if` は NULL を false
-- 扱いにする（実測で確認）。role クレームを欠いた JWT で
-- `auth.role() <> 'service_role'` が NULL になると `and` 全体も NULL になり、
-- ガードそのものが評価されずに fail-open してしまう。空文字にフォールバック
-- することで、role クレームが無い呼び出しは常に non-service-role 扱いにし
-- fail-closed にする。
-- ============================================================

create or replace function public.platform_agent_count()
returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_super_admin_user() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_super_admin_user() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_super_admin_user() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_super_admin_user() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_super_admin_user() then
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
