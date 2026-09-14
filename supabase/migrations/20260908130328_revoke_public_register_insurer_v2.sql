-- ============================================================
-- G-H1 是正: register_insurer_v2 の PUBLIC (anon/authenticated) 実行権限を剥奪
--
-- 監査 2026-09-08 (High): 本関数は SECURITY DEFINER で `auth.users` に
-- email_confirmed_at=now() で直接 INSERT する（= メール確認済みの保険会社
-- admin アカウントを作る）。20260826000006 で「anon から呼ばれる必要が
-- ある」として意図的に revoke 対象から外していたが、実際のアプリ経路
-- （src/app/api/join/route.ts）は service_role の createServiceRoleAdmin
-- 経由でのみ呼び出しており、`src`/`apps/mobile` に `.rpc("register_insurer_v2"`
-- の直接呼び出しは無い（grep で確認）。anon キーで直接
-- POST /rest/v1/rpc/register_insurer_v2 を叩けば、OTP・レート制限・
-- パスワードポリシーをすべて迂回して確認済みアカウントを無制限作成できた。
--
-- 対象は 2 オーバーロード（20260325000000 の 10 引数版、20260325100000 の
-- 12 引数版）。実装メモ: 関数が無い環境で止まらないよう、存在するものだけに当てる。
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'register_insurer_v2'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant  execute on function %s to service_role', r.sig);
  end loop;
end $$;
