-- Diagnostic + fix: change any inet columns on insurer_access_logs or vehicles to text
-- The insurer_search_certificates function expects text columns

-- Fix insurer_access_logs.ip if it's inet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'insurer_access_logs'
      AND column_name = 'ip' AND data_type = 'inet'
  ) THEN
    ALTER TABLE insurer_access_logs ALTER COLUMN ip TYPE text USING ip::text;
    RAISE NOTICE 'Fixed insurer_access_logs.ip from inet to text';
  END IF;
END $$;

-- Fix vehicles.vin_code if it's inet (unlikely but check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles'
      AND column_name = 'vin_code' AND data_type = 'inet'
  ) THEN
    ALTER TABLE vehicles ALTER COLUMN vin_code TYPE text USING vin_code::text;
    RAISE NOTICE 'Fixed vehicles.vin_code from inet to text';
  END IF;
END $$;

-- Fix vehicles.vin if it exists and is inet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles'
      AND column_name = 'vin' AND data_type = 'inet'
  ) THEN
    ALTER TABLE vehicles ALTER COLUMN vin TYPE text USING vin::text;
    RAISE NOTICE 'Fixed vehicles.vin from inet to text';
  END IF;
END $$;

-- Fix certificates.vehicle_vin if it exists and is inet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certificates'
      AND column_name = 'vehicle_vin' AND data_type = 'inet'
  ) THEN
    ALTER TABLE certificates ALTER COLUMN vehicle_vin TYPE text USING vehicle_vin::text;
    RAISE NOTICE 'Fixed certificates.vehicle_vin from inet to text';
  END IF;
END $$;

-- Also recreate the function with explicit casts to be safe
DROP FUNCTION IF EXISTS insurer_search_certificates(text, integer, integer, text, text);
CREATE OR REPLACE FUNCTION insurer_search_certificates(
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
      c.public_id,
      c.status,
      CASE WHEN length(c.customer_name) > 1
        THEN left(c.customer_name, 1) || '***'
        ELSE '***'
      END AS customer_name,
      coalesce(v.model, c.vehicle_info_json->>'model', '')::text AS vehicle_model,
      coalesce(v.plate_display, c.vehicle_info_json->>'plate_display', '')::text AS vehicle_plate,
      coalesce(v.vin_code::text, '')::text AS vehicle_vin,
      coalesce(v.maker, c.vehicle_info_json->>'maker', '')::text AS vehicle_maker,
      v.year AS vehicle_year,
      v.id AS vehicle_id,
      (SELECT count(*) FROM certificate_images ci WHERE ci.certificate_id = c.id) AS image_count,
      ''::text AS latest_image_url,
      c.service_type,
      c.created_at,
      c.tenant_id,
      t.name AS tenant_name
    FROM certificates c
    LEFT JOIN vehicles v ON v.id = c.vehicle_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE
      c.status IN ('active', 'void')
      AND (
        p_query = ''
        OR coalesce(v.vin_code::text, '') = p_query
        OR c.public_id ILIKE '%' || p_query || '%'
        OR coalesce(v.plate_display, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.model, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.maker, '') ILIKE '%' || p_query || '%'
        OR coalesce(c.vehicle_info_json->>'plate_display', '') ILIKE '%' || p_query || '%'
        OR coalesce(c.vehicle_info_json->>'model', '') ILIKE '%' || p_query || '%'
      )
    ORDER BY
      CASE WHEN coalesce(v.vin_code::text, '') = p_query THEN 0 ELSE 1 END,
      c.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
