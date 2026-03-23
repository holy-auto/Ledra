-- Fix: my_tenant_role() should return lowercase to match RLS policy values
CREATE OR REPLACE FUNCTION my_tenant_role(p_tenant_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT lower(role::text) FROM public.tenant_memberships
  WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  LIMIT 1;
$$;
