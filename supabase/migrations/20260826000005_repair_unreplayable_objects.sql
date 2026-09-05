-- ============================================================
-- 本番には在るのに、マイグレーションを空 DB に流し直すと**作られない**オブジェクトを
-- 本番の定義そのまま書き起こす。
--
-- 経緯:
--   `node scripts/replay-migrations.mjs` で 423 本を空 DB に流したところ、
--   何周しても通らないファイルが 27 本あった。原因を辿ると、その多くは
--   1つの根に繋がっていた:
--
--   `20260403000000_add_electronic_signature.sql` が **一度も存在しなかったテーブル**
--   `tenant_members` を RLS ポリシーで参照しており、ファイルごと失敗する。
--   このファイルは `signature_sessions` を作る唯一のファイルなので、
--   以降 `signature_sessions` に触る 7 本が芋づるで落ちる。
--   （本番に `tenant_members` は無い。正しい名前は `tenant_memberships`。
--     `20260719000000_fix_rls_membership_references.sql` はこの誤りの後始末だが、
--     こちらも同じ理由で流せない）
--
--   同様に、作成元のファイルが落ちるために作られない関数・ビューが 4 つある。
--
-- なぜ「履歴を直す」のではなくここで足すのか:
--   既存ファイルを書き換えると本番の適用履歴（supabase_migrations.schema_migrations）と
--   食い違う。本番は既にこれらを持っているので、`if not exists` で足す方が安全で、
--   既存の `repair_drift_*` とも揃う。**本番では全て no-op になる。**
--
-- 本番での効果（2026-08-24 に実測）:
--   テーブル 5 / インデックス 11 / ポリシー 16 は**すべて本番に存在済み**なので、
--   このファイルの DDL は本番では完全な no-op。実際に効くのは末尾の
--   `create or replace function` 5 本（search_path の固め直し）だけで、
--   そちらは権限整理のマイグレーションにまとめて適用する。
--
-- ponytail: これで再生できないファイルは 27 → 大幅に減るが 0 にはならない。
--   `tenant_members` や `tenant_memberships.is_active`（本番にも無い列）を参照する
--   ファイル自体は、履歴を書き換えない限り永久に流せない。上限は
--   `scripts/replay-migrations.mjs` の失敗上限で固定し、**増えたら CI が落ちる**。
-- ============================================================

-- ── signature_sessions（本番の定義そのまま）──────────────────
create table if not exists public.signature_sessions (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid references public.certificates(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'signed', 'expired', 'cancelled')),
  document_hash text not null,
  document_hash_alg text not null default 'SHA-256',
  signer_name text,
  signer_email text,
  signer_phone text,
  notification_method text not null default 'line'
    check (notification_method in ('line', 'email', 'sms')),
  notification_sent_at timestamptz,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  signer_confirmed_email text,
  signature text,
  signing_payload text,
  public_key_fingerprint text,
  key_version text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text,
  customer_id uuid,
  line_user_id text,
  remind_count integer not null default 0,
  last_reminded_at timestamptz,
  notified_channel text,
  purpose text not null default 'certificate'
    check (purpose in ('certificate', 'delivery_receipt', 'estimate_consent', 'change_consent')),
  secondary_factor_required boolean not null default false,
  secondary_factor_verified boolean not null default false,
  secondary_factor_attempts integer not null default 0,
  phone_last4_hash text,
  consent_version text,
  consent_text_hash text,
  reservation_id uuid references public.reservations(id) on delete set null
);

create index if not exists idx_signature_sessions_certificate_id on public.signature_sessions (certificate_id);
create index if not exists idx_signature_sessions_created_by     on public.signature_sessions (created_by);
create index if not exists idx_signature_sessions_status         on public.signature_sessions (status);
create index if not exists idx_signature_sessions_tenant_id      on public.signature_sessions (tenant_id);
create index if not exists idx_signature_sessions_token          on public.signature_sessions (token);
create index if not exists idx_signature_sessions_expires_at     on public.signature_sessions (expires_at) where status = 'pending';
create index if not exists idx_signature_sessions_reservation    on public.signature_sessions (reservation_id) where reservation_id is not null;

alter table public.signature_sessions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'signature_sessions' and policyname = 'signature_sessions_tenant_select') then
    create policy signature_sessions_tenant_select on public.signature_sessions for select
      using (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'signature_sessions' and policyname = 'signature_sessions_tenant_insert') then
    create policy signature_sessions_tenant_insert on public.signature_sessions for insert
      with check (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'signature_sessions' and policyname = 'signature_sessions_service_update') then
    create policy signature_sessions_service_update on public.signature_sessions for update
      using (auth.role() = 'service_role');
  end if;
end $$;

-- ── 作成元のファイルが流せないために作られない関数（本番の定義そのまま）──
create or replace function public.certificate_public_tenant(p_tenant_id uuid)
returns table(tenant_name text, tenant_slug text, tenant_custom_domain text)
language sql stable security definer set search_path to ''
as $$
  select t.name, t.slug, t.custom_domain
  from public.tenants t
  where t.id = p_tenant_id;
$$;

-- 本番の定義は search_path が 'public','auth'。リポジトリの規約
-- （lint-migrations: SECURITY DEFINER は search_path='' 必須）に合わせ、
-- 参照を全てスキーマ修飾したうえで '' に固める。挙動は同じで、こちらの方が堅い
create or replace function public.auth_uid_by_email(p_email text)
returns uuid
language sql security definer set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1
$$;

create or replace function public.certificates_check_craftsman_tenant()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if new.craftsman_staff_id is not null and not exists (
    select 1 from public.staff_members where id = new.craftsman_staff_id and tenant_id = new.tenant_id
  ) then
    raise exception 'craftsman % does not belong to tenant %', new.craftsman_staff_id, new.tenant_id;
  end if;
  return new;
end;
$$;

-- ── signature_audit_logs（signature_sessions と同じ経緯で作られない）────
create table if not exists public.signature_audit_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.signature_sessions(id) on delete cascade,
  event text not null check (event in (
    'session_created', 'notification_sent', 'page_opened', 'signed', 'verified',
    'expired', 'cancelled', 'secondary_factor_failed', 'secondary_factor_locked',
    'secondary_factor_passed', 'consent_displayed', 'receipt_pdf_generated', 'receipt_anchored'
  )),
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_signature_audit_logs_session_id on public.signature_audit_logs (session_id);
create index if not exists idx_signature_audit_logs_event      on public.signature_audit_logs (event);
create index if not exists idx_signature_audit_logs_created_at on public.signature_audit_logs (created_at desc);

alter table public.signature_audit_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='signature_audit_logs' and policyname='audit_logs_tenant_select') then
    create policy audit_logs_tenant_select on public.signature_audit_logs for select
      using (session_id in (
        select s.id from public.signature_sessions s
        where s.tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
      ));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='signature_audit_logs' and policyname='audit_logs_service_insert') then
    create policy audit_logs_service_insert on public.signature_audit_logs for insert
      with check (auth.role() = 'service_role');
  end if;
  -- 監査ログは書き換えない。ポリシーで塞ぐ
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='signature_audit_logs' and policyname='audit_logs_no_update') then
    create policy audit_logs_no_update on public.signature_audit_logs for update using (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='signature_audit_logs' and policyname='audit_logs_no_delete') then
    create policy audit_logs_no_delete on public.signature_audit_logs for delete using (false);
  end if;
end $$;

create or replace function public.get_auth_email(p_user_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.email
  from auth.users u
  where u.id = p_user_id;
$$;

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

-- ── 保険会社向けに email をスコープして返す関数 ────────────────
-- v_insurer_users_list が参照する。作成元のファイルが流せないため作られない
create or replace function public.get_auth_email_scoped(p_user_id uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  my_insurer_id uuid;
begin
  -- 実行者が属している insurer_id
  select iu.insurer_id into my_insurer_id
  from public.insurer_users iu
  where iu.user_id = auth.uid() and iu.is_active = true
  limit 1;

  if my_insurer_id is null then
    return null;
  end if;

  -- 対象 user が同じ insurer_id に属している場合のみ email を返す
  if exists (
    select 1 from public.insurer_users iu2
    where iu2.user_id = p_user_id and iu2.insurer_id = my_insurer_id and iu2.is_active = true
  ) then
    return (select u.email from auth.users u where u.id = p_user_id);
  end if;

  return null;
end;
$$;

-- ── vehicle_mileage_logs（本番の定義そのまま）──────────────────
create table if not exists public.vehicle_mileage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  certificate_id uuid references public.certificates(id) on delete set null,
  mileage_km integer not null check (mileage_km >= 0),
  recorded_at timestamptz not null,
  source text not null default 'manual'
    check (source in ('maintenance', 'inspection', 'manual', 'obd', 'import')),
  created_at timestamptz not null default now()
);

create index if not exists idx_vml_tenant       on public.vehicle_mileage_logs (tenant_id);
create index if not exists idx_vml_vehicle_time on public.vehicle_mileage_logs (vehicle_id, recorded_at);

alter table public.vehicle_mileage_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_mileage_logs' and policyname='vml_select') then
    create policy vml_select on public.vehicle_mileage_logs for select
      using (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_mileage_logs' and policyname='vml_insert') then
    create policy vml_insert on public.vehicle_mileage_logs for insert
      with check (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_mileage_logs' and policyname='vml_service_all') then
    create policy vml_service_all on public.vehicle_mileage_logs for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ── vehicle_inspection_findings（本番の定義そのまま）────────────
create table if not exists public.vehicle_inspection_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  certificate_id uuid references public.certificates(id) on delete set null,
  mileage_km integer check (mileage_km >= 0),
  finding_category text not null check (finding_category in (
    'engine', 'transmission', 'brake', 'tire', 'suspension', 'steering',
    'electric', 'exhaust', 'cooling', 'oil', 'battery', 'body', 'other'
  )),
  finding_severity text not null default 'ok'
    check (finding_severity in ('ok', 'advisory', 'warning', 'critical')),
  finding_code text,
  finding_note text,
  inspected_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vif_tenant                   on public.vehicle_inspection_findings (tenant_id);
create index if not exists idx_vif_vehicle_time             on public.vehicle_inspection_findings (vehicle_id, inspected_at);
create index if not exists idx_vif_vehicle_category_severity on public.vehicle_inspection_findings (vehicle_id, finding_category, finding_severity);

alter table public.vehicle_inspection_findings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_inspection_findings' and policyname='vif_select') then
    create policy vif_select on public.vehicle_inspection_findings for select
      using (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_inspection_findings' and policyname='vif_insert') then
    create policy vif_insert on public.vehicle_inspection_findings for insert
      with check (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_inspection_findings' and policyname='vif_service_all') then
    create policy vif_service_all on public.vehicle_inspection_findings for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ── vehicle_part_replacements（本番の定義そのまま）──────────────
create table if not exists public.vehicle_part_replacements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  certificate_id uuid references public.certificates(id) on delete set null,
  part_installation_id uuid references public.part_installations(id) on delete set null,
  part_category text not null,
  part_name text not null,
  mileage_at_replacement integer check (mileage_at_replacement >= 0),
  replaced_at timestamptz not null,
  next_replacement_mileage_est integer check (next_replacement_mileage_est >= 0),
  next_replacement_date_est date,
  created_at timestamptz not null default now()
);

create index if not exists idx_vpr_tenant           on public.vehicle_part_replacements (tenant_id);
create index if not exists idx_vpr_vehicle_time     on public.vehicle_part_replacements (vehicle_id, replaced_at);
create index if not exists idx_vpr_vehicle_category on public.vehicle_part_replacements (vehicle_id, part_category);

alter table public.vehicle_part_replacements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_part_replacements' and policyname='vpr_select') then
    create policy vpr_select on public.vehicle_part_replacements for select
      using (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_part_replacements' and policyname='vpr_insert') then
    create policy vpr_insert on public.vehicle_part_replacements for insert
      with check (tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicle_part_replacements' and policyname='vpr_service_all') then
    create policy vpr_service_all on public.vehicle_part_replacements for all using (auth.role() = 'service_role');
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 【後から追記】20260616000007 が締めるはずだった EXECUTE を、関数を作った
-- この位置で締める。
--
-- 経緯: auth_uid_by_email / get_auth_email / get_auth_email_scoped は本番にしか
-- 無く、マイグレーションではこのファイルで初めて作られる。20260616000007 の revoke は
-- 「関数が無ければ飛ばす」ようにしたので、**空 DB では誰も締めない**まま残っていた。
-- これらは auth.users の email を引く SECURITY DEFINER なので、anon 鍵のクライアント
-- から任意ユーザーの email が引けてしまう。プレビュー DB でも同じことが起きる。
--
-- 本番は 20260616000007 が実行済みで既に service_role のみ（pg_proc.proacl で確認済み、
-- 2026-09-04）。このファイルは適用済みで再適用されないので本番への影響は無い。
-- 新しいファイルは作らない（out-of-order で db push が止まるため）。
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
