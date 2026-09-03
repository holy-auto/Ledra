-- ============================================================
-- 本番の schema_migrations に記録されているが、リポジトリにファイルが
-- 無かったバージョンへの対応ファイル。
--
-- 経緯: この変更は Supabase MCP の apply_migration で本番へ直接適用された
-- （このセッションの作業ではない。適用者・時期は特定できていない）。
-- その方式は本番の schema_migrations に「Supabase が採番したバージョン」を
-- 記録するだけで、リポジトリにファイルを作らない。結果、本番にだけ存在する
-- バージョンが生まれ、`supabase db push` が
--   "Remote migration versions not found in local migrations directory."
-- で停止した（2026-08-29、PR #938 のマージ時）。停止するとこれ以降のスキーマ
-- 変更が本番に届かなくなるため、DECISION_LOG 2026-07-21 の方針どおり
-- **本番のバージョンには必ず同名のファイルを置く**。
--
-- 過去3件（20260824005513 等）と異なり、このテーブルの実体を持つ別ファイルは
-- 存在しない（アプリコードからの参照も無い＝未使用のまま放置されている）ため、
-- ここでは空プレースホルダにせず、本番の supabase_migrations.schema_migrations
-- から実際に適用された statements をそのまま採録する（2026-08-29 に本番へ
-- 直接 SELECT して確認済み）。空DBからの再生（Migrations Replay）でも
-- この内容がそのまま実行される。
--
-- 【要確認】このテーブルの利用予定・書き込み経路（INSERT/UPDATE の RLS
-- ポリシーが無く、SELECT のみ）は未確認。DECISION_LOG に起票する。
-- ============================================================
create table if not exists public.user_interface_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_mode text not null default 'standard'
    check (display_mode in ('simple', 'standard', 'dense')),
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

comment on table public.user_interface_preferences is
  'Shared per-user UI density and onboarding state. Device-only overrides remain in local storage.';

alter table public.user_interface_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_interface_preferences'
      and policyname = 'user_interface_preferences_select_own'
  ) then
    create policy user_interface_preferences_select_own
      on public.user_interface_preferences
      for select
      using (tenant_id in (select public.my_tenant_ids()) and user_id = auth.uid());
  end if;
end $$;
