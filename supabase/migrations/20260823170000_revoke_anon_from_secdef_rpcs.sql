-- ============================================================
-- 未認証（anon）から呼べてはいけない SECURITY DEFINER 関数の EXECUTE を剥奪する
--
-- 経緯:
--   Supabase の security advisor が `anon_security_definer_function_executable`
--   を 53 件報告していた。実際に `has_function_privilege('anon', ..., 'EXECUTE')`
--   を確認したところ**すべて true**で、PostgREST の `/rest/v1/rpc/<name>` から
--   未認証で呼べる状態だった。
--
--   中でも次の2つは**関数の中に呼び出し元の検査が無い**（`auth.uid()` も
--   `tenant_memberships` も参照しない）ため、実害が出る:
--
--   - `pos_checkout(...)`      : 引数の p_tenant_id / p_user_id をそのまま使って
--                                payments と documents を作る。未認証で任意の
--                                テナントに決済レコードを作れる。
--   - `upsert_agent_user(...)` : agent_users に任意の role で upsert する。
--                                代理店 ID とメールが分かれば、未認証で
--                                その代理店の admin を付けられる。
--
--   `replace_staff_shifts` は内部で tenant_memberships を見ているので anon は
--   'forbidden' で弾かれるが、そもそも呼べる必要が無いので併せて剥奪する。
--
-- 対象の選び方（壊さないための条件、3つすべてを満たすものだけ）:
--   1. RLS ポリシーの中で参照されていない
--      （ポリシー内の関数は評価する側のロールで実行されるため、anon から
--        剥奪すると公開ページの読み取りが壊れる。`my_tenant_ids` など 19 本は
--        この理由で対象外）
--   2. アプリからの呼び出しが `authenticated`（サーバクライアント）か
--      `service_role` のみ（コードを実際に確認済み）
--   3. 未認証で呼べる必要が無い
--      （`register_insurer_v2` は保険会社の自己登録で anon が必要なので対象外）
--
-- 残りの SECURITY DEFINER 関数（insurer_* / get_my_* など）は、内部で
-- `auth.uid()` を見ていて anon では空を返すため実害は小さいが、多層防御としては
-- 剥奪が望ましい。呼び出し経路の確認が要るため OPEN_QUESTIONS に分けて起票する。
-- ============================================================

-- 実装メモ: `revoke execute on function ...` は関数が無いとエラーになる。
-- 空 DB から作った環境や、その関数がまだ入っていない環境で止まらないよう、
-- **存在するものだけ**剥奪する。オーバーロード（同名で引数違い）も全て拾う。
do $$
declare
  r record;
  -- anon から剥奪する関数名
  targets text[] := array[
    -- 書き込み（最優先。内部に呼び出し元の検査が無い）
    'pos_checkout', 'upsert_agent_user', 'replace_staff_shifts', 'insurer_audit_log',
    -- テナント横断の集計（運営向けの数字）
    'platform_agent_count', 'platform_insurer_count', 'platform_certificate_stats',
    'platform_regional_stats', 'platform_tenant_category_stats',
    -- テナントを引数で指定して経営数値を返すもの
    'billing_analytics_stats', 'management_kpi_stats', 'dashboard_tenant_stats',
    -- 代理店向けの集計
    'agent_dashboard_stats', 'agent_rankings'
  ];
  -- anon と authenticated の両方から剥奪する関数名（トリガ専用で RPC から
  -- 呼ぶ必要が一切無い。トリガは所有者の権限で動くので付与も不要）
  trigger_only text[] := array['certificate_versions_no_update', 'webauthn_assertions_no_update'];
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(targets || trigger_only)
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    if r.proname = any(trigger_only) then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;
