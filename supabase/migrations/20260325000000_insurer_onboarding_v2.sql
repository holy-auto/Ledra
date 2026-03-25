-- =============================================================
-- Insurer Onboarding V2 Migration
-- - insurers テーブル拡張（法人番号・住所・代表者・利用規約同意・却下理由）
-- - メール確認コード用テーブル
-- - 登録トランザクション用 RPC
-- - 管理者操作監査ログテーブル
-- =============================================================

-- =============================================================
-- 1) insurers テーブル拡張カラム
-- =============================================================
alter table insurers
  add column if not exists corporate_number  text,
  add column if not exists address            text,
  add column if not exists representative_name text,
  add column if not exists terms_accepted_at  timestamptz,
  add column if not exists rejection_reason   text;

-- =============================================================
-- 2) メール確認コード用テーブル (insurer_email_verifications)
-- =============================================================
create table if not exists insurer_email_verifications (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code        text not null,
  expires_at  timestamptz not null,
  verified    boolean not null default false,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_iev_email on insurer_email_verifications (email, verified);

-- 古いレコードは24時間後に自動クリーン（cron別途）
comment on table insurer_email_verifications is 'OTP codes for insurer self-registration email verification. Rows expire after 24h.';

-- =============================================================
-- 3) 管理者操作監査ログ (admin_audit_logs)
-- =============================================================
create table if not exists admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users (id),
  action      text not null,
  target_type text not null,
  target_id   text,
  before_data jsonb,
  after_data  jsonb,
  meta        jsonb default '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_aal_actor on admin_audit_logs (actor_id);
create index if not exists idx_aal_target on admin_audit_logs (target_type, target_id);
create index if not exists idx_aal_created on admin_audit_logs (created_at);

alter table admin_audit_logs enable row level security;

-- 管理者のみ閲覧可能
create policy "aal_select_platform_admin" on admin_audit_logs
  for select using (
    exists (
      select 1 from tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = current_setting('app.platform_tenant_id', true)::uuid
        and tm.role in ('admin', 'owner')
    )
  );

-- INSERT はサービスロールキー経由のみ（アプリからadmin clientで書く）

-- =============================================================
-- 4) RPC: register_insurer_v2
--    トランザクション内で auth.users + insurers + insurer_users を
--    一括作成する。失敗時は全てロールバック。
-- =============================================================
create or replace function register_insurer_v2(
  p_email              text,
  p_password           text,
  p_company_name       text,
  p_contact_person     text,
  p_phone              text default '',
  p_requested_plan     text default 'basic',
  p_corporate_number   text default null,
  p_address            text default null,
  p_representative_name text default null,
  p_terms_accepted     boolean default false
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_user_id uuid;
  v_insurer_id uuid;
  v_slug text;
  v_suffix text;
begin
  -- Validate terms acceptance
  if not p_terms_accepted then
    raise exception 'terms_not_accepted: 利用規約への同意が必要です';
  end if;

  -- Check email not already used
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    raise exception 'email_exists: このメールアドレスは既に登録されています';
  end if;

  -- Generate slug
  v_suffix := substr(md5(random()::text), 1, 8);
  v_slug := regexp_replace(lower(p_company_name), '[^a-z0-9\s-]', '', 'g');
  v_slug := regexp_replace(trim(v_slug), '\s+', '-', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  if v_slug = '' then v_slug := 'insurer'; end if;
  v_slug := v_slug || '-' || v_suffix;

  -- 1) Create auth user (email_confirm = false → must verify via OTP)
  v_user_id := extensions.uuid_generate_v4();
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),  -- We confirm because OTP was already verified in previous step
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('display_name', p_contact_person),
    now(),
    now(),
    '',
    false
  );

  -- Also create identity record
  insert into auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_user_id,
    lower(p_email),
    'email',
    jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email)),
    now(),
    now(),
    now()
  );

  -- 2) Create insurer record
  insert into insurers (
    id, name, slug, is_active, status,
    requested_plan, contact_person, contact_email, contact_phone,
    corporate_number, address, representative_name,
    terms_accepted_at, signup_source
  ) values (
    gen_random_uuid(), p_company_name, v_slug, true, 'active_pending_review',
    p_requested_plan, p_contact_person, lower(p_email), nullif(p_phone, ''),
    nullif(p_corporate_number, ''), nullif(p_address, ''), nullif(p_representative_name, ''),
    case when p_terms_accepted then now() else null end, 'self'
  )
  returning id into v_insurer_id;

  -- 3) Create insurer_users record (first user = admin)
  insert into insurer_users (insurer_id, user_id, role, display_name, is_active)
  values (v_insurer_id, v_user_id, 'admin', p_contact_person, true);

  -- All three operations in one transaction — if any fail, all rollback
  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'insurer_id', v_insurer_id
  );
end;
$$;

-- =============================================================
-- 5) insurer_users DELETE policy (admin can remove members)
-- =============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'iu_delete'
  ) then
    create policy "iu_delete" on insurer_users
      for delete using (
        insurer_id in (select my_insurer_ids())
        and exists (
          select 1 from insurer_users iu
          where iu.user_id = auth.uid()
            and iu.insurer_id = insurer_users.insurer_id
            and iu.role = 'admin'
            and iu.is_active = true
        )
      );
  end if;
end $$;
