-- Fix: super_admin role was not recognized by RLS policies.
-- All write policies check for 'owner'/'admin' but my_tenant_role() returned
-- 'super_admin' verbatim, causing every INSERT/UPDATE/DELETE to be blocked
-- for super_admin users (e.g. store registration → internal_error).
--
-- Map super_admin → owner at the helper-function level so every existing
-- (and future) policy that grants owner automatically grants super_admin.

CREATE OR REPLACE FUNCTION public.my_tenant_role(p_tenant_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    CASE lower(role::text)
      WHEN 'super_admin' THEN 'owner'
      ELSE lower(role::text)
    END
  FROM public.tenant_memberships
  WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  LIMIT 1;
$function$;
