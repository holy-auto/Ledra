-- Add plan-based result limits to insurer search
CREATE OR REPLACE FUNCTION insurer_search_certificates(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  public_id text,
  status text,
  customer_name text,
  vehicle_model text,
  vehicle_plate text,
  vehicle_vin text,
  created_at timestamptz,
  tenant_id uuid,
  tenant_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_plan_tier text;
  v_max_limit integer;
  v_effective_limit integer;
BEGIN
  -- Resolve caller
  SELECT iu.id, iu.insurer_id INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized insurer access';
  END IF;

  -- Get insurer plan tier for result limits
  SELECT i.plan_tier INTO v_plan_tier
  FROM insurers i WHERE i.id = v_insurer_id;

  v_max_limit := CASE v_plan_tier
    WHEN 'enterprise' THEN 200
    WHEN 'pro' THEN 50
    ELSE 10  -- basic
  END;

  v_effective_limit := LEAST(p_limit, v_max_limit);

  -- Log the search action
  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'search',
    jsonb_build_object('query', p_query, 'limit', v_effective_limit, 'offset', p_offset),
    p_ip, p_user_agent);

  -- Search ONLY within contracted tenants
  RETURN QUERY
  SELECT
    c.public_id,
    c.status,
    c.customer_name,
    c.vehicle_model,
    c.vehicle_plate,
    c.vehicle_vin,
    c.created_at,
    c.tenant_id,
    t.name AS tenant_name
  FROM certificates c
  JOIN tenants t ON t.id = c.tenant_id
  JOIN insurer_tenant_contracts itc ON itc.tenant_id = c.tenant_id
    AND itc.insurer_id = v_insurer_id
    AND itc.status = 'active'
  WHERE
    c.status IN ('active', 'void')
    AND (
      p_query = '' OR
      c.public_id ILIKE '%' || p_query || '%' OR
      c.customer_name ILIKE '%' || p_query || '%' OR
      c.vehicle_model ILIKE '%' || p_query || '%' OR
      c.vehicle_plate ILIKE '%' || p_query || '%' OR
      c.vehicle_vin ILIKE '%' || p_query || '%'
    )
  ORDER BY c.created_at DESC
  LIMIT v_effective_limit
  OFFSET p_offset;
END;
$$;
