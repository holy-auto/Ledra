-- 公開デモアカウントは、ブラウザから DB を直接書く経路でも書けないようにする。
--
-- 経緯: デモの読み取り専用は certificates / vehicles / customers の 3 表の RLS（20260514000001）だけだった。
-- アプリの API とサーバーアクションは proxy で断っている（#1341、src/lib/demoWriteGuard.ts）が、
-- 公開アカウントは自分の access_token で PostgREST・Storage を直接叩ける。本番で数えると、
-- authenticated に書き込みを許す規則がある表は 180（うち tenant_id 列が無いもの 48）、
-- RLS を素通りする SECURITY DEFINER の書き込み RPC がテナント側に 1 本（replace_staff_shifts）、
-- Storage の書き込み規則が 2 本（market）あった（OPEN_QUESTIONS 2026-10-13）。
--
-- 方針: 判定は「呼び出した人がデモテナントの所属者か」（proxy のガードと同じ）。行の tenant_id では見ない ——
-- tenant_id 列の無い表（利用者ごとの設定など）も止めたいため。
-- public の全表と storage.objects に、INSERT・UPDATE・DELETE の RESTRICTIVE ポリシーを足す。
-- RESTRICTIVE は既存の PERMISSIVE と AND されるので、デモの所属者だけ全部の書き込みが落ち、他の人は変わらない。
-- SELECT には足さない（見るのは許す）。service role は RLS を素通りするので、デモのシード・サーバーの処理は変わらない。
--
-- ponytail: 新しい表は、このポリシーを付けないとデモから書ける。付け忘れは
-- scripts/replay/checks/demo_member_readonly.sql が CI（npm run check:migrations）で落とす。
-- 付け方はこのファイルの DO ブロックをそのまま流す（付いている表は飛ばす）。
-- SECURITY DEFINER で書く RPC は RLS を通らないので、関数の中で public.is_demo_member() を見る（replace_staff_shifts と同じ）。
-- 新しく足す関数を自動で見つける検査は無い（判断に依存）。

create or replace function public.is_demo_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships
    where user_id = auth.uid() and tenant_id = '00000000-0000-0000-0000-de0000000010'::uuid
  );
$$;

comment on function public.is_demo_member() is
  '呼び出した人が公開デモテナントの所属者か。デモの書き込みを RLS で断るために使う（20261016132455）。';

revoke execute on function public.is_demo_member() from public, anon;
grant execute on function public.is_demo_member() to authenticated;

DO $$
DECLARE
  t regclass;
BEGIN
  FOR t IN
    SELECT c.oid::regclass
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'demo_member_readonly_insert'
      )
  LOOP
    -- (select ...) で包むと文ごとに 1 回だけ評価される（行ごとに引かない）
    EXECUTE format(
      'CREATE POLICY demo_member_readonly_insert ON %s AS RESTRICTIVE FOR INSERT TO authenticated '
      || 'WITH CHECK (NOT (SELECT public.is_demo_member()))', t);
    EXECUTE format(
      'CREATE POLICY demo_member_readonly_update ON %s AS RESTRICTIVE FOR UPDATE TO authenticated '
      || 'USING (NOT (SELECT public.is_demo_member())) WITH CHECK (NOT (SELECT public.is_demo_member()))', t);
    EXECUTE format(
      'CREATE POLICY demo_member_readonly_delete ON %s AS RESTRICTIVE FOR DELETE TO authenticated '
      || 'USING (NOT (SELECT public.is_demo_member()))', t);
  END LOOP;
END
$$;

-- Storage（アップロード・上書き・削除）
create policy demo_member_readonly_insert on storage.objects as restrictive for insert to authenticated
  with check (not (select public.is_demo_member()));
create policy demo_member_readonly_update on storage.objects as restrictive for update to authenticated
  using (not (select public.is_demo_member())) with check (not (select public.is_demo_member()));
create policy demo_member_readonly_delete on storage.objects as restrictive for delete to authenticated
  using (not (select public.is_demo_member()));

-- RLS を通らない書き込み RPC。中身は本番の定義のまま、デモの所属者を先に断る 1 行だけ足す。
CREATE OR REPLACE FUNCTION public.replace_staff_shifts(p_staff_id uuid, p_shifts jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid;
  v_today  date := current_date;
begin
  if public.is_demo_member() then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.staff_members where id = p_staff_id;
  if v_tenant is null then
    raise exception 'staff not found';
  end if;
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = auth.uid() and lower(role::text) in ('super_admin', 'owner', 'admin')
  ) then
    raise exception 'forbidden';
  end if;

  delete from public.staff_shifts
  where staff_id = p_staff_id and tenant_id = v_tenant and work_date >= v_today;

  insert into public.staff_shifts (id, tenant_id, staff_id, work_date, start_time, end_time, note)
  select gen_random_uuid(), v_tenant, p_staff_id,
         (s->>'work_date')::date,
         nullif(s->>'start_time', '')::time,
         nullif(s->>'end_time', '')::time,
         nullif(s->>'note', '')
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) as s
  where (s->>'work_date')::date >= v_today;
end;
$function$;
