-- ============================================================
-- audit_logs: マイグレーションと実 DB の食い違いを解消する
--
-- 状況:
--   `20260325000001_mobile_support.sql` は audit_logs を
--   `table_name / record_id / performed_by / ip_address` という形で
--   CREATE TABLE IF NOT EXISTS している。一方、**本番の audit_logs は
--   `actor_type / actor_user_id / target_public_id / query_json / ip` という
--   別の形**で、こちらは保険会社の閲覧ログ用に作られたもの（349 行はすべて
--   actor_type='insurer'）。どのマイグレーションもこの形を作っていない。
--
--   つまり本番はマイグレーションの外で今の形になっており、空 DB から
--   再生すると mobile_support 版の形になる。同じコードが環境によって
--   動いたり動かなかったりする状態だった。
--
-- このマイグレーションは**本番の形に寄せる**（本番でデータが入っているのは
-- こちらで、アプリのコードもこちらを書く）。
-- 既に本番の形になっている環境では、すべて IF NOT EXISTS / IF EXISTS で
-- no-op になる。
--
-- 注: mobile_support 版の列（table_name / record_id / performed_by /
-- ip_address / old_values / new_values / reason / device_id）は**削除しない**。
-- 空 DB から再生した環境には NOT NULL の table_name / record_id が残るため、
-- NOT NULL だけ外して insert を通す。列そのものは次のマイグレーションで
-- 落とす（データがある環境で先に落とすと戻せない）。
-- ============================================================

-- 1) 本番の形の列を足す（本番では既にあるので no-op）
alter table public.audit_logs add column if not exists actor_type       text;
alter table public.audit_logs add column if not exists actor_user_id    uuid;
alter table public.audit_logs add column if not exists insurer_id       uuid;
alter table public.audit_logs add column if not exists target_public_id text;
alter table public.audit_logs add column if not exists query_json       jsonb;
alter table public.audit_logs add column if not exists ip               text;
alter table public.audit_logs add column if not exists user_agent       text;
alter table public.audit_logs add column if not exists created_at       timestamptz not null default now();
alter table public.audit_logs add column if not exists performed_at     timestamptz not null default now();

-- 2) mobile_support 版で NOT NULL になっている列を緩める。
--    空 DB 再生時に table_name / record_id が NOT NULL のままだと
--    アプリの insert が必ず失敗する。
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
      and column_name = 'table_name' and is_nullable = 'NO'
  ) then
    alter table public.audit_logs alter column table_name drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
      and column_name = 'record_id' and is_nullable = 'NO'
  ) then
    alter table public.audit_logs alter column record_id drop not null;
  end if;
end $$;

-- 3) actor_type を必須 + 値を限定する（本番と同じ制約）。
--    既存行に NULL があれば tenant 扱いで埋めてから NOT NULL にする。
update public.audit_logs set actor_type = 'tenant' where actor_type is null;

alter table public.audit_logs alter column actor_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audit_logs'::regclass
      and conname = 'audit_logs_actor_type_check'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_actor_type_check
      check (actor_type in ('tenant', 'insurer', 'system')) not valid;
    -- NOT VALID で足してから別途検証する（ACCESS EXCLUSIVE で全表を走査しない）
    alter table public.audit_logs validate constraint audit_logs_actor_type_check;
  end if;
end $$;

-- 索引は CONCURRENTLY が要る＝トランザクション内で流せないため、
-- 別マイグレーション（20260823000001）に分ける。
