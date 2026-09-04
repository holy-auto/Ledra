-- Security advisory remediation — extension_in_public (WARN 0014)
--
-- Move the pg_trgm extension out of the public schema into the dedicated
-- `extensions` schema.
--
-- Safe-move procedure:
--   1. The `anon` / `authenticated` roles have no search_path configured, so
--      they fall back to the built-in default ("$user", public) which does NOT
--      include `extensions`. Add `extensions` to their search_path first so any
--      raw trigram operator/function usage keeps resolving after the move.
--      (The SECURITY DEFINER search functions already pin
--       search_path = public, extensions, pg_temp, so they are unaffected.)
--   2. Move the extension. The lone trigram index
--      (vehicles_plate_display_trgm) references the gin_trgm_ops opclass by OID
--      and survives the move; no public-schema function body references a
--      pg_trgm function explicitly (verified), so nothing else needs updating.
--
-- Reversible with: alter extension pg_trgm set schema public;

alter role anon          set search_path = public, extensions;
alter role authenticated set search_path = public, extensions;

-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **`pg_trgm` はどのマイグレーションでも作られていない。** 本番には手で入っているが、
-- 空 DB（Supabase のプレビュー DB）には無いので、そのまま alter すると
-- `extension "pg_trgm" does not exist (SQLSTATE 42704)` で落ちる。
-- 手元の再生では `scripts/replay/bootstrap.sql` が先に作っているため再現しなかった
-- ——「本番にあるのに、どのマイグレーションにも書かれていない」ドリフトそのもの。
--
-- 無ければ作り、別スキーマにあれば移す。既に extensions にあれば何もしない。
do $mig$
declare
  ns text;
begin
  select n.nspname into ns
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if ns is null then
    execute 'create extension pg_trgm with schema extensions';
  elsif ns <> 'extensions' then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end
$mig$;
