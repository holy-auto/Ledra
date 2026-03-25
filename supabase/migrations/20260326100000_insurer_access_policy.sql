-- =============================================================
-- Insurer Access Policy: Closed-by-default + expired visible
-- =============================================================
-- 決定事項:
--   1. Closed-by-default: insurer_tenant_access に行がないと何も見えない
--   2. PII: 常にマスキング（双方同意なしでは顧客名非表示）— 変更なし
--   3. DL権限: pro以上 + 監査ログ + テナント通知 — API側で制御
--   4. ステータス: active + void + expired を表示（draft のみ非表示）
-- =============================================================

-- =============================================================
-- 1) insurer_tenant_access テーブル（未作成の場合のみ）
-- =============================================================
CREATE TABLE IF NOT EXISTS insurer_tenant_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id  uuid NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (insurer_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ita_insurer ON insurer_tenant_access(insurer_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ita_tenant ON insurer_tenant_access(tenant_id) WHERE is_active = true;

ALTER TABLE insurer_tenant_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ita_select_insurer" ON insurer_tenant_access;
CREATE POLICY "ita_select_insurer" ON insurer_tenant_access
  FOR SELECT USING (insurer_id IN (SELECT my_insurer_ids()));

-- =============================================================
-- 2) Helper: アクセス可能テナントID一覧
-- =============================================================
CREATE OR REPLACE FUNCTION insurer_accessible_tenant_ids(p_insurer_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id
  FROM insurer_tenant_access
  WHERE insurer_id = p_insurer_id
    AND is_active = true
    AND revoked_at IS NULL;
$$;

-- =============================================================
-- 3) 検索RPC: Closed-by-default + expired 追加
-- =============================================================
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
  -- 認証チェック
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  -- 監査ログ
  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'search',
    jsonb_build_object('query', p_query, 'limit', p_limit, 'offset', p_offset),
    p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      c.public_id,
      c.status,
      -- PII 常にマスキング
      CASE WHEN length(c.customer_name) > 1
        THEN left(c.customer_name, 1) || '***'
        ELSE '***'
      END AS customer_name,
      coalesce(v.model, c.vehicle_info_json->>'model', '') AS vehicle_model,
      coalesce(v.plate_display, c.vehicle_info_json->>'plate_display', '') AS vehicle_plate,
      coalesce(v.vin_code, '') AS vehicle_vin,
      coalesce(v.maker, c.vehicle_info_json->>'maker', '') AS vehicle_maker,
      v.year AS vehicle_year,
      v.id AS vehicle_id,
      (SELECT count(*) FROM certificate_images ci WHERE ci.certificate_id = c.id) AS image_count,
      '' AS latest_image_url,
      c.service_type,
      c.created_at,
      c.tenant_id,
      t.name AS tenant_name
    FROM certificates c
    LEFT JOIN vehicles v ON v.id = c.vehicle_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE
      -- ステータス: active + void + expired（draft は非表示）
      c.status IN ('active', 'void', 'expired')
      -- Closed-by-default: 明示的にアクセス許可されたテナントのみ
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

-- =============================================================
-- 4) 証明書詳細RPC: Closed-by-default テナント認可
-- =============================================================
DROP FUNCTION IF EXISTS insurer_get_certificate(text, text, text);
CREATE OR REPLACE FUNCTION insurer_get_certificate(
  p_public_id  text,
  p_ip         text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  public_id        text,
  status           text,
  customer_name    text,
  pii_disclosed    boolean,
  vehicle_model    text,
  vehicle_plate    text,
  vehicle_vin      text,
  vehicle_maker    text,
  vehicle_year     integer,
  vehicle_id       uuid,
  service_type     text,
  certificate_no   text,
  content_free_text text,
  content_preset_json jsonb,
  expiry_type      text,
  expiry_value     text,
  warranty_period_end date,
  ppf_coverage_json jsonb,
  coating_products_json jsonb,
  maintenance_json jsonb,
  body_repair_json jsonb,
  created_at       timestamptz,
  updated_at       timestamptz,
  tenant_id        uuid,
  tenant_name      text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_cert_id uuid;
  v_cert_tenant_id uuid;
  v_pii_ok boolean;
BEGIN
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  -- 証明書取得 + テナントID
  SELECT c.id, c.tenant_id INTO v_cert_id, v_cert_tenant_id
  FROM certificates c WHERE c.public_id = p_public_id LIMIT 1;

  IF v_cert_id IS NULL THEN
    RAISE EXCEPTION 'Certificate not found';
  END IF;

  -- Closed-by-default: テナントアクセスチェック
  IF NOT EXISTS (
    SELECT 1 FROM insurer_tenant_access
    WHERE insurer_id = v_insurer_id
      AND tenant_id = v_cert_tenant_id
      AND is_active = true
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied: insurer does not have access to this tenant';
  END IF;

  -- PII開示チェック
  v_pii_ok := is_pii_disclosed(v_cert_id, v_insurer_id);

  -- 監査ログ
  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, certificate_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, v_cert_id, 'view',
    jsonb_build_object('public_id', p_public_id, 'pii_disclosed', v_pii_ok),
    p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      c.id,
      c.public_id,
      c.status,
      CASE WHEN v_pii_ok THEN c.customer_name
        ELSE CASE WHEN length(c.customer_name) > 1
          THEN left(c.customer_name, 1) || '***'
          ELSE '***'
        END
      END AS customer_name,
      v_pii_ok AS pii_disclosed,
      coalesce(v.model, c.vehicle_info_json->>'model', '') AS vehicle_model,
      coalesce(v.plate_display, c.vehicle_info_json->>'plate_display', '') AS vehicle_plate,
      coalesce(v.vin_code, '') AS vehicle_vin,
      coalesce(v.maker, c.vehicle_info_json->>'maker', '') AS vehicle_maker,
      v.year AS vehicle_year,
      v.id AS vehicle_id,
      c.service_type,
      c.certificate_no,
      c.content_free_text,
      c.content_preset_json,
      c.expiry_type,
      c.expiry_value,
      c.warranty_period_end,
      c.ppf_coverage_json,
      c.coating_products_json,
      c.maintenance_json,
      c.body_repair_json,
      c.created_at,
      c.updated_at,
      c.tenant_id,
      t.name AS tenant_name
    FROM certificates c
    LEFT JOIN vehicles v ON v.id = c.vehicle_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE c.public_id = p_public_id
    LIMIT 1;
END;
$$;

-- =============================================================
-- 5) 車両検索RPC: Closed-by-default + expired
-- =============================================================
DROP FUNCTION IF EXISTS insurer_search_vehicles(text, integer, integer, text, text);
CREATE OR REPLACE FUNCTION insurer_search_vehicles(
  p_query      text DEFAULT '',
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  vehicle_id            uuid,
  maker                 text,
  model                 text,
  year                  integer,
  plate_display         text,
  vin_code              text,
  size_class            text,
  tenant_id             uuid,
  tenant_name           text,
  certificate_count     bigint,
  latest_cert_public_id text,
  latest_cert_status    text,
  latest_cert_created_at timestamptz
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
  VALUES (v_insurer_id, v_insurer_user_id, 'vehicle_search',
    jsonb_build_object('query', p_query), p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      v.id AS vehicle_id,
      v.maker, v.model, v.year, v.plate_display, v.vin_code, v.size_class,
      v.tenant_id,
      t.name AS tenant_name,
      count(c.id) AS certificate_count,
      (SELECT c2.public_id FROM certificates c2
       WHERE c2.vehicle_id = v.id ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_public_id,
      (SELECT c2.status FROM certificates c2
       WHERE c2.vehicle_id = v.id ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_status,
      (SELECT c2.created_at FROM certificates c2
       WHERE c2.vehicle_id = v.id ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_created_at
    FROM vehicles v
    LEFT JOIN tenants t ON t.id = v.tenant_id
    LEFT JOIN certificates c ON c.vehicle_id = v.id AND c.status IN ('active', 'void', 'expired')
    WHERE
      -- Closed-by-default: アクセス許可テナントのみ
      v.tenant_id IN (SELECT insurer_accessible_tenant_ids(v_insurer_id))
      AND (
        p_query = ''
        OR coalesce(v.vin_code, '') = p_query
        OR coalesce(v.plate_display, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.maker, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.model, '') ILIKE '%' || p_query || '%'
      )
    GROUP BY v.id, v.maker, v.model, v.year, v.plate_display,
             v.vin_code, v.size_class, v.tenant_id, t.name
    ORDER BY
      CASE WHEN coalesce(v.vin_code, '') = p_query THEN 0 ELSE 1 END,
      max(c.created_at) DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =============================================================
-- 6) 車両証明書一覧RPC: Closed-by-default + expired
-- =============================================================
DROP FUNCTION IF EXISTS insurer_get_vehicle_certificates(uuid, text, text);
CREATE OR REPLACE FUNCTION insurer_get_vehicle_certificates(
  p_vehicle_id uuid,
  p_ip         text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  certificate_id uuid,
  public_id      text,
  status         text,
  customer_name  text,
  service_type   text,
  certificate_no text,
  created_at     timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_vehicle_tenant_id uuid;
BEGIN
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  -- 車両のテナントID取得
  SELECT v.tenant_id INTO v_vehicle_tenant_id
  FROM vehicles v WHERE v.id = p_vehicle_id;

  -- Closed-by-default: テナントアクセスチェック
  IF NOT EXISTS (
    SELECT 1 FROM insurer_tenant_access
    WHERE insurer_id = v_insurer_id
      AND tenant_id = v_vehicle_tenant_id
      AND is_active = true
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'vehicle_view',
    jsonb_build_object('vehicle_id', p_vehicle_id), p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      c.id AS certificate_id,
      c.public_id,
      c.status,
      CASE WHEN length(c.customer_name) > 1
        THEN left(c.customer_name, 1) || '***' ELSE '***'
      END AS customer_name,
      c.service_type,
      c.certificate_no,
      c.created_at
    FROM certificates c
    WHERE c.vehicle_id = p_vehicle_id AND c.status IN ('active', 'void', 'expired')
    ORDER BY c.created_at DESC;
END;
$$;
