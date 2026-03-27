-- =============================================================
-- insurer_search_stores: 保険会社ポータル店舗検索RPC
-- アクセス可能テナントの店舗を検索
-- =============================================================
CREATE OR REPLACE FUNCTION insurer_search_stores(
  p_query      text DEFAULT '',
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  store_id         uuid,
  store_name       text,
  store_address    text,
  store_phone      text,
  store_email      text,
  store_manager    text,
  store_hours      jsonb,
  tenant_id        uuid,
  tenant_name      text
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
  VALUES (v_insurer_id, v_insurer_user_id, 'store_search',
    jsonb_build_object('query', p_query, 'limit', p_limit, 'offset', p_offset),
    p_ip::text, p_user_agent::text);

  RETURN QUERY
    SELECT
      s.id AS store_id,
      s.name AS store_name,
      coalesce(s.address, '') AS store_address,
      coalesce(s.phone, '') AS store_phone,
      coalesce(s.email, '') AS store_email,
      coalesce(s.manager_name, '') AS store_manager,
      coalesce(s.business_hours, '{}'::jsonb) AS store_hours,
      s.tenant_id,
      t.name AS tenant_name
    FROM stores s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE
      s.is_active = true
      AND s.tenant_id IN (SELECT insurer_accessible_tenant_ids(v_insurer_id))
      AND (
        p_query = ''
        OR s.name ILIKE '%' || p_query || '%'
        OR coalesce(s.address, '') ILIKE '%' || p_query || '%'
        OR t.name ILIKE '%' || p_query || '%'
        OR coalesce(s.manager_name, '') ILIKE '%' || p_query || '%'
      )
    ORDER BY t.name, s.sort_order, s.name
    LIMIT p_limit OFFSET p_offset;
END;
$$;
