-- Insurer-Tenant relationship table for access control
CREATE TABLE IF NOT EXISTS insurer_tenant_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id uuid NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
  contracted_at timestamptz NOT NULL DEFAULT now(),
  terminated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(insurer_id, tenant_id)
);

CREATE INDEX idx_itc_insurer ON insurer_tenant_contracts(insurer_id) WHERE status = 'active';
CREATE INDEX idx_itc_tenant ON insurer_tenant_contracts(tenant_id) WHERE status = 'active';

ALTER TABLE insurer_tenant_contracts ENABLE ROW LEVEL SECURITY;

-- RLS: insurers can see their own contracts
CREATE POLICY "insurer_view_own_contracts" ON insurer_tenant_contracts
  FOR SELECT USING (
    insurer_id IN (
      SELECT iu.insurer_id FROM insurer_users iu
      WHERE iu.user_id = auth.uid() AND iu.is_active = true
    )
  );

-- Replace insurer_search_certificates to enforce tenant contracts
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
BEGIN
  -- Resolve caller
  SELECT iu.id, iu.insurer_id INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized insurer access';
  END IF;

  -- Log the search action
  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'search',
    jsonb_build_object('query', p_query, 'limit', p_limit, 'offset', p_offset),
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
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Replace insurer_get_certificate to enforce tenant contracts
CREATE OR REPLACE FUNCTION insurer_get_certificate(
  p_public_id text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  public_id text,
  status text,
  customer_name text,
  vehicle_model text,
  vehicle_plate text,
  vehicle_vin text,
  content_free_text text,
  created_at timestamptz,
  updated_at timestamptz,
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
  v_cert_id uuid;
BEGIN
  -- Resolve caller
  SELECT iu.id, iu.insurer_id INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized insurer access';
  END IF;

  -- Check tenant contract exists for this certificate's tenant
  SELECT c.id INTO v_cert_id
  FROM certificates c
  JOIN insurer_tenant_contracts itc ON itc.tenant_id = c.tenant_id
    AND itc.insurer_id = v_insurer_id
    AND itc.status = 'active'
  WHERE c.public_id = p_public_id;

  IF v_cert_id IS NULL THEN
    RETURN; -- Return empty (cert not found or no contract)
  END IF;

  -- Log the view action
  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, certificate_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, v_cert_id, 'view',
    jsonb_build_object('public_id', p_public_id),
    p_ip, p_user_agent);

  RETURN QUERY
  SELECT
    c.id,
    c.public_id,
    c.status,
    c.customer_name,
    c.vehicle_model,
    c.vehicle_plate,
    c.vehicle_vin,
    c.content_free_text,
    c.created_at,
    c.updated_at,
    c.tenant_id,
    t.name AS tenant_name
  FROM certificates c
  JOIN tenants t ON t.id = c.tenant_id
  WHERE c.id = v_cert_id;
END;
$$;
