-- ============================================================
-- 未認証（anon）から呼べる SECURITY DEFINER 関数の第2弾（残り 37 本の整理）
--
-- 第1弾（20260823235804）で危険度の高い 16 本を絞った。残りを1本ずつ
-- 呼び出し経路まで確認した結果、次のように分かれた。
--
--   全 37 本
--   ├─ 19 本: **RLS ポリシーの中で参照されている**（my_tenant_ids など）
--   │         → ポリシー内の関数は評価する側のロールで実行されるため、
--   │           剥奪すると公開ページの読み取りが壊れる。**対象外**
--   ├─  3 本: anon から呼ばれる必要がある。**対象外**
--   │         - certificate_public_tenant(uuid): ビュー `certificates_public`
--   │           （security_invoker=on、anon に SELECT 権限あり）が参照している。
--   │           公開証明書ページが未ログインで開かれるので anon が実行する
--   │         - register_insurer_v2(...) 2 本: 保険会社の自己登録
--   ├─  9 本: アプリが**利用者トークン**で呼んでいる → anon だけ剥奪
--   └─  6 本: SECURITY DEFINER 関数の中からしか呼ばれない、または
--             どこからも呼ばれていない → anon と authenticated を剥奪
--
-- 呼び出し経路の確認方法（推測ではなく実測）:
--   - RLS: pg_policy の qual / with_check に関数名が出るか
--   - 関数の中: pg_proc.prosrc に関数名が出るか（呼び出し元が SECURITY DEFINER なら
--     本体は所有者の権限で動くので、anon の EXECUTE は不要）
--   - ビュー: pg_get_viewdef に出るか（security_invoker のビューは要注意）
--   - アプリ: src/ と apps/mobile/src/ の `.rpc("<name>"` を grep
--
-- 第1弾と同じく **PUBLIC から revoke** する。`revoke ... from anon` だけでは
-- 何も変わらない（EXECUTE は既定で PUBLIC に付与され、anon の権限はそこ由来）。
-- ============================================================

do $$
declare
  r record;
  -- アプリが利用者トークンで呼ぶ。anon だけ落とす
  user_token text[] := array[
    'get_my_agent_status',              -- 代理店ポータルのガード / サイドバー / API
    'get_my_insurer_status',            -- 保険会社ポータルのガード
    'get_my_user_contexts',             -- /api/auth/context
    'insurer_get_certificate',          -- 保険会社の証明書照会・PDF・書き出し
    'insurer_get_vehicle_certificates', -- 保険会社の車両詳細
    'insurer_search_certificates',      -- 保険会社の検索・書き出し
    'insurer_search_stores',            -- 保険会社の店舗検索
    'insurer_search_vehicles'           -- 保険会社の車両検索（引数違いで2本）
  ];
  -- SECURITY DEFINER の中からしか呼ばれない、またはどこからも呼ばれない。
  -- anon と authenticated の両方を落とす（呼び出し元は所有者権限で動く）
  internal_only text[] := array[
    'current_insurer_id',            -- insurer_search_vehicles の中だけ
    'insurer_accessible_tenant_ids', -- insurer_search_* 3 本の中だけ
    'is_pii_disclosed',              -- insurer_get_certificate の中だけ
    'my_org_ids',                    -- my_org_tenant_ids の中だけ
    'get_certificate_service_price', -- 呼び出し元なし（関数・ビュー・アプリのいずれにも無い）
    'is_agent_admin'                 -- 呼び出し元なし
  ];
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(user_token || internal_only)
  loop
    if r.proname = any(user_token) then
      execute format('revoke execute on function %s from public, anon', r.sig);
      execute format('grant  execute on function %s to authenticated, service_role', r.sig);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
      execute format('grant  execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- ── search_path の固め直し ────────────────────────────────
-- 20260824000000_repair_unreplayable_objects.sql で書き起こした関数のうち、
-- 本番でまだ可変（`'public','auth'` など）のものをリポジトリの規約
-- （SECURITY DEFINER は search_path = '' 必須）に合わせる。
--
-- 本体が全てスキーマ修飾されているものは設定を変えるだけでよい。
-- `certificate_public_tenant` と `certificates_check_craftsman_tenant` は
-- 本番で既に `''` なので触らない。
alter function public.auth_uid_by_email(text)     set search_path = '';
alter function public.get_auth_email(uuid)        set search_path = '';
alter function public.get_auth_email_scoped(uuid) set search_path = '';

-- この 2 本は本体が `from tenants` と**非修飾**なので、設定だけ変えると壊れる。
-- 修飾したうえで置き換える
create or replace function public.platform_regional_stats()
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  result json;
begin
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
language plpgsql security definer set search_path = ''
as $$
declare
  result json;
begin
  select json_agg(row_to_json(r)) into result
  from (
    select coalesce(category, 'unset') as category, count(*) as count
    from public.tenants where is_active = true group by category order by count desc
  ) r;
  return coalesce(result, '[]'::json);
end;
$$;
