-- 20260616000007 が締めるはずだった EXECUTE を、関数が実在するこの位置で締め直す。
--
-- 経緯: auth_uid_by_email / get_auth_email / get_auth_email_scoped は本番にしか無く、
-- マイグレーションでは 1つ前の 20260826000005 で初めて作られる。20260616000007 の
-- revoke は「関数が無ければ飛ばす」ようにしたので、**空 DB では誰も締めない**まま
-- 残っていた（作られるのがそれより後なので当然）。
-- これらは auth.users の email を引く SECURITY DEFINER なので、anon 鍵のクライアントから
-- 任意ユーザーの email が引けてしまう。プレビュー DB でも同じことが起きる。
--
-- 本番では 20260616000007 が実行済みで同じ状態なので no-op。冪等。
DO $mig$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.auth_uid_by_email(text)',
    'public.get_auth_email(uuid)',
    'public.get_auth_email_scoped(uuid)'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('revoke execute on function %s from public, anon, authenticated', sig);
      EXECUTE format('grant execute on function %s to service_role', sig);
    END IF;
  END LOOP;
END
$mig$;
