-- Security advisory remediation — function_search_path_mutable (WARN 0011)
--
-- Pins a fixed search_path on every public-schema function that currently has
-- none, so SECURITY DEFINER functions can't be hijacked via a caller-controlled
-- search_path and SECURITY INVOKER functions resolve objects deterministically.
--
-- Done as a catalog-driven DO block (rather than 68 hand-written ALTERs) so it
-- stays correct across overloads. Extension-owned functions (pg_depend
-- deptype='e', e.g. the pg_trgm operator/support functions) are intentionally
-- excluded — their search_path is managed by the extension and is not flagged
-- by the linter.
--
-- search_path is set to `public, extensions, pg_temp` (not '') because the
-- existing function bodies reference public objects unqualified; an empty
-- search_path would break them. pg_temp is pinned last to prevent temp-object
-- shadowing.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proconfig is null
        or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
      )
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'  -- skip extension-owned functions
      )
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
  end loop;
end $$;
