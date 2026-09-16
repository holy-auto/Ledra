-- ============================================================
-- code-review 指摘 (2026-09-08): 20260908140748 で platform_* 統計5関数に
-- 追加した is_super_admin_user() ガードが、アプリ層の isPlatformAdmin()
-- （src/lib/auth/platformAdmin.ts）と噛み合っていない。
--
-- isPlatformAdmin() の実際の判定:
--   caller.tenantId === PLATFORM_TENANT_ID
--   かつ role が super_admin / owner / admin のいずれか
--
-- is_super_admin_user() の判定:
--   role = 'super_admin' の membership が「どのテナントであっても」存在すれば true
--   （tenant_id の一致は見ない）
--
-- 差分は2方向:
--   1. 過小: 運営テナント(PLATFORM_TENANT_ID)の owner/admin は
--      isPlatformAdmin() を通るのに is_super_admin_user() では弾かれる
--      （API層は通っても、この関数を直接呼ぶ経路があれば forbidden になる）。
--   2. 過大: 運営テナント以外のどこかに super_admin ロールの membership が
--      あれば、そのテナントとは無関係に運営統計（全テナント横断の証明書数・
--      保険会社数・地域別集計）を取得できてしまう。
--
-- get_platform_tenant_id()（20260325200000 で定義済み、platform_config テーブル
-- を参照）を使い、isPlatformAdmin() と全く同じ (tenant_id, role) の組で判定する
-- is_platform_admin() を新設し、5関数のガードをこちらに揃える。
-- is_super_admin_user() 自体は site_content_posts 等の他機能で使われている
-- ため意味は変えない（影響範囲を広げない）。
-- ============================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships
    where user_id = auth.uid()
      and tenant_id = public.get_platform_tenant_id()
      and role in ('super_admin', 'owner', 'admin')
  );
$$;

create or replace function public.platform_agent_count()
returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
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
