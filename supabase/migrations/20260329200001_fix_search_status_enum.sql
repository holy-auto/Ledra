-- Fix: certificates.status is an enum (certificate_status_enum), not text
-- Remove 'expired' which doesn't exist in the enum
-- Cast status to text in output to match RETURNS TABLE

DROP FUNCTION IF EXISTS insurer_search_certificates(text, integer, integer, text, text);

CREATE FUNCTION insurer_search_certificates(
  p_query      text DEFAULT '',
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  public_id      text,
  status         text,
  customer_name  text,
  vehicle_model  text,
  vehicle_plate  text,
  vehicle_vin    text,
  vehicle_maker  text,
  vehicle_year   integer,
  vehicle_id     uuid,
  image_count    bigint,
  latest_image_url text,
  service_type   text,
  created_at     timestamptz,
  tenant_id      uuid,
  tenant_name    text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
BEGIN
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'search',
    jsonb_build_object('query', p_query, 'limit', p_limit, 'offset', p_offset),
    p_ip::text, p_user_agent::text);

  RETURN QUERY
    SELECT
      c.public_id::text,
      c.status::text,
      (CASE WHEN length(c.customer_name) > 1
        THEN left(c.customer_name, 1) || '***'
        ELSE '***'
      END)::text AS customer_name,
      coalesce(v.model, c.vehicle_info_json->>'model', '')::text AS vehicle_model,
      coalesce(v.plate_display, c.vehicle_info_json->>'plate_display', '')::text AS vehicle_plate,
      coalesce(v.vin_code, '')::text AS vehicle_vin,
      coalesce(v.maker, c.vehicle_info_json->>'maker', '')::text AS vehicle_maker,
      v.year::integer AS vehicle_year,
      v.id AS vehicle_id,
      (SELECT count(*)::bigint FROM certificate_images ci WHERE ci.certificate_id = c.id) AS image_count,
      ''::text AS latest_image_url,
      coalesce(c.service_type, '')::text AS service_type,
      c.created_at,
      c.tenant_id,
      coalesce(t.name, '')::text AS tenant_name
    FROM certificates c
    LEFT JOIN vehicles v ON v.id = c.vehicle_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE
      c.status::text IN ('active', 'void')
      AND c.tenant_id IN (SELECT insurer_accessible_tenant_ids(v_insurer_id))
      AND (
        p_query = ''
        OR coalesce(v.vin_code, '') = p_query
        OR c.public_id ILIKE '%' || p_query || '%'
        OR coalesce(v.plate_display, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.model, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.maker, '') ILIKE '%' || p_query || '%'
        OR coalesce(c.vehicle_info_json->>'plate_display', '') ILIKE '%' || p_query || '%'
        OR coalesce(c.vehicle_info_json->>'model', '') ILIKE '%' || p_query || '%'
      )
    ORDER BY
      CASE WHEN coalesce(v.vin_code, '') = p_query THEN 0 ELSE 1 END,
      c.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
