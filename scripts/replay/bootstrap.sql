-- ============================================================
-- Supabase が最初から用意しているもののうち、マイグレーションが前提にしている
-- 最小限を素の PostgreSQL 上に作る。**再生専用**で、本番には流さない。
--
-- ここに足すのは「Supabase 側が提供しているもの」だけ。アプリのテーブルを
-- ここへ書いてはいけない（それをやると再生できているように見えるだけになる）。
-- ============================================================

-- ── ロール ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin superuser; end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user nologin; end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- ── スキーマ ──────────────────────────────────────────────
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists graphql_public;
create schema if not exists realtime;
create schema if not exists cron;

-- ── 拡張 ──────────────────────────────────────────────────
-- **Supabase が新規プロジェクトに既定で入れるものだけを書く。**
-- ここに「あると便利だから」で足すと、マイグレーションが自分で作っていない拡張に
-- 依存していても再生が通ってしまい、実物のプレビュー DB でだけ落ちる。
-- 実際 2026-09-04 に、pg_trgm をここで作っていたせいで
-- `20260616000005_move_pg_trgm_to_extensions_schema.sql` の
-- `alter extension pg_trgm set schema extensions` が
-- `extension "pg_trgm" does not exist` で落ちることに気づけなかった
-- （pg_trgm は Supabase の既定では入らない）。
create extension if not exists "uuid-ossp"  with schema extensions;
create extension if not exists pgcrypto     with schema extensions;

-- 本番は extensions スキーマに置いているが、非修飾で呼ぶマイグレーションがあるため
-- 探索パスに入れておく（本番の postgres ロールも同じ設定）
alter database postgres set search_path = "$user", public, extensions;

-- ── auth スキーマ（GoTrue 相当の最小形）────────────────────
create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text,
  phone text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists auth.identities (
  id text,
  user_id uuid references auth.users(id) on delete cascade,
  provider text,
  identity_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (provider, id)
);

create table if not exists auth.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- JWT から値を取り出す関数群。本番と同じシグネチャにする
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (auth.jwt() ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (auth.jwt() ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (auth.jwt() ->> 'email')
  )::text
$$;

-- ── storage スキーマ（最小形）──────────────────────────────
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

create or replace function storage.filename(name text) returns text
language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

create or replace function storage.extension(name text) returns text
language sql immutable as $$ select split_part(storage.filename(name), '.', 2) $$;

-- ── cron（pg_cron が入っていない環境向けのダミー）──────────
-- スケジュール登録はマイグレーションの本質ではないので、呼ばれても落ちないようにする
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$ select 0::bigint $$;

create or replace function cron.unschedule(job_name text) returns boolean
language sql as $$ select true $$;

-- ── realtime の publication ────────────────────────────────
-- Supabase が既定で作る。マイグレーションが `alter publication supabase_realtime
-- add table ...` を書いているので、無いとそのファイルごと落ちる
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ── 権限 ──────────────────────────────────────────────────
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant all on all tables in schema auth, storage to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
