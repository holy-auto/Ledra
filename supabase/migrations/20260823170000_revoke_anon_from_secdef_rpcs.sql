-- ============================================================
-- 未認証（anon）から呼べてはいけない SECURITY DEFINER 関数の EXECUTE を絞る
--
-- 経緯:
--   Supabase の security advisor の指摘を `has_function_privilege` で実測したところ、
--   `anon` が `/rest/v1/rpc/<name>` から呼べる SECURITY DEFINER 関数が 53 本あった。
--   うち2本は**関数の中に呼び出し元の検査が無い**（`auth.uid()` も
--   `tenant_memberships` も参照しない）:
--
--   - `pos_checkout(...)`      : 引数の p_tenant_id / p_user_id をそのまま使って
--                                payments と documents を作る
--   - `upsert_agent_user(...)` : agent_users に任意の role で upsert する
--
--   同じく検査が無く、テナント ID を引数で受け取るもの:
--   - `billing_analytics_stats(p_tenant_id, p_customer_id)` / `management_kpi_stats(p_tenant_id)`
--
-- **重要（この migration を書き直した理由）**:
--   最初は `revoke execute ... from anon` だけを書いていたが、これは**何も変えない**。
--   関数の EXECUTE は既定で PUBLIC に付与されており、`anon` の権限はそこ由来なので、
--   anon から revoke しても PUBLIC の付与（`=X/postgres`）が残る。
--   PostgreSQL 16 で実測:
--     作成直後          : has_function_privilege('anon', f, 'EXECUTE') = true, proacl = NULL
--     revoke from anon  : true のまま（proacl = {=X/postgres,postgres=X/postgres}）
--     revoke from public: false
--   したがって **必ず PUBLIC から revoke し、必要なロールへ grant し直す**。
--   既存の `20260616000002_lock_down_server_only_secdef_functions.sql` も同じ形。
--
-- 方針:
--   (A) 呼び出し元の検査が無く、アプリ側のルートが既に権限確認をしているもの
--       → PUBLIC / anon / authenticated から revoke し、service_role にだけ grant。
--         アプリはサービスロールのクライアントで呼ぶよう合わせて変更した。
--   (B) 関数の中で `auth.uid()` や membership を見ているもの、および利用者トークンで
--       呼ぶ必要があるもの
--       → PUBLIC / anon からのみ revoke し、authenticated と service_role に grant。
--   (C) トリガ専用の関数（RPC から呼ぶ必要が一切無い）
--       → PUBLIC / anon / authenticated から revoke。トリガは所有者の権限で動くので
--         どのロールにも grant しない。
--
-- 対象外:
--   - RLS ポリシーの中で参照される 19 本（`my_tenant_ids` など）。ポリシー内の関数は
--     評価する側のロールで実行されるため、anon から剥奪すると公開ページが壊れる。
--   - `register_insurer_v2`（保険会社の自己登録。anon が必要）。
--
-- 実装メモ: 関数が無い環境で止まらないよう、存在するものだけに当てる。
--           オーバーロード（同名で引数違い）も全て拾う。
-- ============================================================

do $$
declare
  r record;
  -- (A) service_role だけが呼べればよい
  server_only text[] := array[
    'pos_checkout', 'upsert_agent_user', 'billing_analytics_stats', 'management_kpi_stats'
  ];
  -- (B) 利用者トークンで呼ぶ必要がある（anon だけ落とす）
  user_token text[] := array[
    'replace_staff_shifts',   -- 内部で auth.uid() と tenant_memberships を見ている
    'insurer_audit_log',      -- 内部で auth.uid() を見ている
    'dashboard_tenant_stats', -- 内部で membership を見ている
    'agent_dashboard_stats',  -- 内部で auth.uid() を見ている
    'agent_rankings',
    'platform_agent_count', 'platform_insurer_count', 'platform_certificate_stats',
    'platform_regional_stats', 'platform_tenant_category_stats'
  ];
  -- (C) トリガ専用
  trigger_only text[] := array['certificate_versions_no_update', 'webauthn_assertions_no_update'];
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(server_only || user_token || trigger_only)
  loop
    if r.proname = any(server_only) then
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
      execute format('grant  execute on function %s to service_role', r.sig);
    elsif r.proname = any(user_token) then
      execute format('revoke execute on function %s from public, anon', r.sig);
      execute format('grant  execute on function %s to authenticated, service_role', r.sig);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    end if;
  end loop;
end $$;
