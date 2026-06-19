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

alter extension pg_trgm set schema extensions;
