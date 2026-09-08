-- ============================================================
-- 本番にはあるのに `supabase/migrations/` のどこにも CREATE が無かったオブジェクトを、
-- **本番の定義そのまま**書き起こす。同日の drop ファイルで消す分は含めない。
--
-- 経緯（OPEN_QUESTIONS / DECISION_LOG 2026-09-06）:
--   本番 public とマイグレーションを突き合わせたら、**63 個**が未管理だった
--   （棚卸し時は 69 と報告したが、試作の検出器がマイグレーションの字面を
--   正規表現で読んでおり、動的 SQL で作られるトリガ 6 本を誤検出していた）。
--   内訳と処遇:
--     テーブル 23 → 全部 drop（20260907010000）
--     関数     24 → 7 本 drop、**17 本をここで書き起こす**
--     トリガ    9 → 6 本は drop 対象の表の上なので、**3 本をここ**
--     ビュー    1 → ここ（`v_insurer_users_list`）
--     enum 型   5 → ここ（マイグレーションに `CREATE TYPE` が1本も無かった）
--     イベントトリガ 1 → ここ（`ensure_rls`。新規テーブルに RLS を自動で有効化する）
--
-- 本番では全文が no-op になる（`create or replace` と存在チェック）。
-- 効くのは空 DB から再生したときだけ。
--
-- **権限も写す。** `current_insurer_id` と `rls_auto_enable` は本番で PUBLIC の
-- 実行権が剥がしてあり、定義だけ書き起こすと**再生した DB のほうが緩くなる**。
-- ここまで含めて初めて「同じ DB」と言える。
--
-- **本番と字面が違う点が2つある。** どちらも意図的で、理由をその場に書いてある。
--   1. SECURITY DEFINER 5 本の `search_path` を `''` にした。本番は
--      `'public','auth'` などで、`lint:migrations` の
--      security-definer-mutable-search-path に引っかかる。allowlist に逃げるより
--      直すほうが筋で、5 本とも本体は既に `public.` / `auth.` で修飾済みなので
--      挙動は変わらない（`insurer_accessible_tenant_ids` で 20260903123728 が
--      同じ直し方をしている）。`rls_auto_enable` の `pg_catalog` は
--      空 search_path でも常に暗黙で検索されるため不要。
--   2. `member_role_in_tenant` の戻り値にキャストを1つ足した（その場のコメント参照）。
--
-- ponytail: 上限。ここで写すのは**オブジェクトの有無と実行権限**だけで、
--   列の型は写していない。本番の `tenants.plan_tier` などは enum 型だが、
--   マイグレーション側は `text + check`（しかも値が3個で、本番の5個より狭い）。
--   空 DB から再生した DB へ本番データを入れると 24 テナント中 20 件が
--   check に弾かれる。これは別件として OPEN_QUESTIONS に起票済み。
-- ============================================================

-- ── 1. enum 型 ──────────────────────────────────────────────
-- `create type` には `if not exists` が無いので DO で包む。
do $mig$
begin
  if to_regtype('public.certificate_status_enum') is null then
    create type public.certificate_status_enum as enum ('active', 'void', 'draft');
  end if;
  if to_regtype('public.expiry_type_enum') is null then
    create type public.expiry_type_enum as enum ('date', 'maintenance', 'text');
  end if;
  if to_regtype('public.membership_role_enum') is null then
    create type public.membership_role_enum as enum ('owner', 'admin', 'staff', 'super_admin', 'viewer');
  end if;
  if to_regtype('public.plan_tier_enum') is null then
    create type public.plan_tier_enum as enum ('mini', 'standard', 'pro', 'free', 'starter');
  end if;
  if to_regtype('public.template_scope_enum') is null then
    create type public.template_scope_enum as enum ('shared', 'tenant');
  end if;
end
$mig$;

-- ── 2. 関数 ────────────────────────────────────────────────
-- 依存順に並べる（norm_* → group_key、enum → member_role_in_tenant）。

CREATE OR REPLACE FUNCTION public.normalize_plate_search(src text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT regexp_replace(
    lower(COALESCE(src, '')),
    '[\s　\-‐-‒–—―ーｰ−－・･\.]',
    '',
    'g'
  )
$function$;

CREATE OR REPLACE FUNCTION public.norm_vehicle_plate(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.normalize_plate_search(coalesce(p_text, ''));
$function$;

CREATE OR REPLACE FUNCTION public.norm_vehicle_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select regexp_replace(
    lower(trim(replace(coalesce(p_text, ''), '　', ' '))),
    '\s+',
    ' ',
    'g'
  );
$function$;

CREATE OR REPLACE FUNCTION public.norm_vehicle_year(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select nullif(regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g'), '');
$function$;

CREATE OR REPLACE FUNCTION public.certificate_vehicle_group_key(p_vehicle_id uuid, p_vehicle_info_json jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case
    when p_vehicle_id is not null then
      'vid:' || p_vehicle_id::text
    when public.norm_vehicle_plate(p_vehicle_info_json->>'plate') <> '' then
      'plate:' || public.norm_vehicle_plate(p_vehicle_info_json->>'plate')
    else
      'mmy:' ||
      public.norm_vehicle_text(p_vehicle_info_json->>'maker') || '|' ||
      public.norm_vehicle_text(p_vehicle_info_json->>'model') || '|' ||
      coalesce(public.norm_vehicle_year(p_vehicle_info_json->>'year'), '')
  end;
$function$;

CREATE OR REPLACE FUNCTION public.vehicle_group_key_from_fields(p_vehicle_id uuid, p_plate text, p_maker text, p_model text, p_year text, p_fallback_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case
    when public.norm_vehicle_plate(p_plate) <> '' then
      'plate:' || public.norm_vehicle_plate(p_plate)
    when p_vehicle_id is not null then
      'veh:' || p_vehicle_id::text
    when public.norm_vehicle_text(p_maker) <> ''
     and public.norm_vehicle_text(p_model) <> '' then
      'mmy:' ||
      public.norm_vehicle_text(p_maker) || '|' ||
      public.norm_vehicle_text(p_model) || '|' ||
      coalesce(public.norm_vehicle_year(p_year), '')
    else
      'cert:' || coalesce(p_fallback_id::text, 'unknown')
  end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_vehicle_representative_certificate_public_id(p_context text, p_latest_active_certificate_public_id text, p_latest_certificate_public_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case lower(coalesce(nullif(btrim(p_context), ''), 'all'))
    when 'active' then
      nullif(btrim(p_latest_active_certificate_public_id), '')
    when 'void' then
      case
        when nullif(btrim(p_latest_active_certificate_public_id), '') is not null then null
        else nullif(btrim(p_latest_certificate_public_id), '')
      end
    else
      coalesce(
        nullif(btrim(p_latest_active_certificate_public_id), ''),
        nullif(btrim(p_latest_certificate_public_id), '')
      )
  end;
$function$;

CREATE OR REPLACE FUNCTION public.current_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select tm.tenant_id
  from public.tenant_memberships tm
  where tm.user_id = auth.uid()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_insurer_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select iu.insurer_id
  from public.insurer_users iu
  where iu.user_id = auth.uid()
    and coalesce(iu.is_active, true) = true
  order by iu.created_at desc nulls last
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.is_member_of_tenant(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.member_role_in_tenant(p_tenant_id uuid)
 RETURNS public.membership_role_enum
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- 本番の定義は `select tm.role`（キャスト無し）。ここだけ本番と字面が違う。
  -- 理由: 本番の `tenant_memberships.role` は membership_role_enum 型だが、
  -- この列を作るマイグレーションは `text` で宣言している（上限の項参照）。
  -- キャスト無しだと空 DB への再生が
  -- `return type mismatch in function declared to return membership_role_enum`
  -- で落ちる。本番では enum → 同じ enum のキャストなので挙動は変わらない。
  select tm.role::public.membership_role_enum
  from public.tenant_memberships tm
  where tm.tenant_id = p_tenant_id
    and tm.user_id = auth.uid()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.generate_public_id()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select encode(gen_random_bytes(16), 'hex')
$function$;

CREATE OR REPLACE FUNCTION public.generate_vehicle_public_id()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_id text;
begin
  loop
    v_id := 'v_' || encode(gen_random_bytes(12), 'hex');
    exit when not exists (
      select 1
      from public.vehicles
      where public_id = v_id
    );
  end loop;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_case_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'CASE-' || to_char(now(), 'YYYYMM') || '-' ||
      lpad((SELECT count(*) + 1 FROM insurer_cases)::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_vehicles_for_cartrust(p_query text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_status text DEFAULT 'all'::text)
 RETURNS TABLE(vehicle_id uuid, vehicle_public_id text, plate_display text, maker text, model text, year_text text, latest_certificate_public_id text, latest_active_certificate_public_id text, latest_certificate_status text, latest_certificate_ts timestamp with time zone, certificate_count bigint, search_rank integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with input as (
  select
    nullif(btrim(p_query), '') as raw_q,
    public.normalize_plate_search(nullif(btrim(p_query), '')::text) as plate_q,
    lower(nullif(btrim(p_query), '')::text) as text_q,
    case
      when lower(coalesce(nullif(btrim(p_status), ''), 'all')) in ('all', 'active', 'void')
        then lower(coalesce(nullif(btrim(p_status), ''), 'all'))
      else 'all'
    end as status_q,
    greatest(1, least(coalesce(p_limit, 30), 100)) as lim,
    greatest(coalesce(p_offset, 0), 0) as ofs
),
latest_any as (
  select distinct on (c.vehicle_id)
    c.vehicle_id,
    c.public_id::text as public_id,
    c.status::text as status,
    coalesce(c.updated_at, c.created_at) as ts
  from public.certificates c
  where c.vehicle_id is not null
  order by
    c.vehicle_id,
    coalesce(c.updated_at, c.created_at) desc,
    c.id desc
),
latest_active as (
  select distinct on (c.vehicle_id)
    c.vehicle_id,
    c.public_id::text as public_id,
    coalesce(c.updated_at, c.created_at) as ts
  from public.certificates c
  where c.vehicle_id is not null
    and c.status = 'active'
  order by
    c.vehicle_id,
    coalesce(c.updated_at, c.created_at) desc,
    c.id desc
),
cert_counts as (
  select
    c.vehicle_id,
    count(*)::bigint as certificate_count
  from public.certificates c
  where c.vehicle_id is not null
  group by c.vehicle_id
),
base as (
  select
    v.id as vehicle_id,
    v.public_id::text as vehicle_public_id,
    v.plate_display::text as plate_display,
    v.maker::text as maker,
    v.model::text as model,
    v.year::text as year_text,
    la.public_id as latest_certificate_public_id,
    lact.public_id as latest_active_certificate_public_id,
    la.status as latest_certificate_status,
    la.ts as latest_certificate_ts,
    coalesce(cc.certificate_count, 0) as certificate_count,
    public.normalize_plate_search(v.plate_display) as plate_norm,
    lower(
      coalesce(v.maker, '') || ' ' ||
      coalesce(v.model, '') || ' ' ||
      coalesce(v.year::text, '') || ' ' ||
      coalesce(v.plate_display, '')
    ) as search_text
  from public.vehicles v
  left join latest_any la
    on la.vehicle_id = v.id
  left join latest_active lact
    on lact.vehicle_id = v.id
  left join cert_counts cc
    on cc.vehicle_id = v.id
  cross join input i
  where i.raw_q is not null
    and (
      public.normalize_plate_search(v.plate_display) like '%' || i.plate_q || '%'
      or lower(
        coalesce(v.maker, '') || ' ' ||
        coalesce(v.model, '') || ' ' ||
        coalesce(v.year::text, '') || ' ' ||
        coalesce(v.plate_display, '')
      ) like '%' || i.text_q || '%'
    )
    and (
      i.status_q = 'all'
      or (i.status_q = 'active' and lact.public_id is not null)
      or (
        i.status_q = 'void'
        and coalesce(lower(la.status), '') = 'void'
        and lact.public_id is null
      )
    )
),
ranked as (
  select
    b.vehicle_id,
    b.vehicle_public_id,
    b.plate_display,
    b.maker,
    b.model,
    b.year_text,
    b.latest_certificate_public_id,
    b.latest_active_certificate_public_id,
    b.latest_certificate_status,
    b.latest_certificate_ts,
    b.certificate_count,
    case
      when b.plate_norm = i.plate_q then 0
      when b.plate_norm like i.plate_q || '%' then 1
      when b.plate_norm like '%' || i.plate_q || '%' then 2
      when b.search_text like i.text_q || '%' then 3
      else 4
    end as search_rank
  from base b
  cross join input i
)
select
  r.vehicle_id,
  r.vehicle_public_id,
  r.plate_display,
  r.maker,
  r.model,
  r.year_text,
  r.latest_certificate_public_id,
  r.latest_active_certificate_public_id,
  r.latest_certificate_status,
  r.latest_certificate_ts,
  r.certificate_count,
  r.search_rank
from ranked r
order by
  r.search_rank asc,
  case
    when r.latest_active_certificate_public_id is not null then 0
    when coalesce(lower(r.latest_certificate_status), '') = 'void' then 2
    else 1
  end asc,
  r.latest_certificate_ts desc nulls last,
  r.vehicle_id
limit (select lim from input)
offset (select ofs from input);
$function$;

-- ── 3. 実行権限（本番の状態をそのまま写す）─────────────────
-- 定義だけ書き起こすと、再生した DB のほうが**緩くなる**。
revoke execute on function public.current_insurer_id() from public, anon, authenticated;
grant  execute on function public.current_insurer_id() to service_role;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant  execute on function public.rls_auto_enable() to service_role;

-- ── 4. ビュー ──────────────────────────────────────────────
-- `get_auth_email_scoped` は 20260826000005 が書き起こしている。
--
-- **`with (security_invoker = on)` は必須。** `create or replace view` は
-- reloptions を**引き継がず消す**（PostgreSQL 16 で実測: 付けずに置き換えると
-- `security_invoker=on` が消えて `(オプション無し)` になる）。
-- 消すと呼び出し元ではなく**所有者の権限**で走るようになり、
-- `insurer_users` の RLS を迂回して**全保険会社のユーザーとメールアドレスが
-- 見える**。20260531000006 が本番の 4 ビューすべてに付けた設定なので、
-- 定義を書き起こすこちらが黙って剥がしてはいけない。
create or replace view public.v_insurer_users_list
  with (security_invoker = on) as
  select
    id as insurer_user_id,
    insurer_id,
    user_id,
    public.get_auth_email_scoped(user_id) as email,
    role,
    is_active,
    created_at,
    updated_at,
    display_name,
    last_login_at
  from public.insurer_users iu;

-- ── 5. トリガ ──────────────────────────────────────────────
-- `create or replace trigger` は PostgreSQL 14 以降。本番は 17、CI の再生は 16。
--
-- **3 本だけ。** 最初は 9 本書いていたが、うち 6 本
-- （`trg_agent_{campaigns,faqs,invoices,support_tickets,training_courses,
-- training_progress}_updated_at`）は `20260324120000_agent_features.sql` が
-- **動的 SQL（`execute format`）で既に作っていた**。
-- 棚卸しに使った試作の検出器がマイグレーションの**字面**を正規表現で読んでいたため、
-- 動的に作られるこの 6 本を「未管理」と誤検出していた（PR #1045 のレビュー指摘）。
-- 本番の検出器（`scripts/check-schema-drift.mjs`）は**再生した DB の pg_dump**を
-- 読むのでこの取りこぼしが無い。
--
-- リテラルで書くのは、土台のテーブルが無いときに黙って飛ばさず
-- 再生がその場で落ちるようにするため。
create or replace trigger trg_nfc_tags_set_updated_at
  before update on public.nfc_tags
  for each row execute function public.set_updated_at();

create or replace trigger trg_vehicle_histories_set_updated_at
  before update on public.vehicle_histories
  for each row execute function public.set_updated_at();

create or replace trigger trg_vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ── 6. イベントトリガ ──────────────────────────────────────
-- `ensure_rls` は **public に作られた新規テーブルへ RLS を自動で有効化する**。
-- これが無い DB では、新しいテーブルが RLS 無しで生まれる。
-- `create event trigger` に `if not exists` は無いので存在チェックで包む。
do $mig$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      execute function public.rls_auto_enable();
  end if;
end
$mig$;
