-- =============================================================
-- Insurer Portal v2: VIN-based access + PII disclosure consent
-- =============================================================

-- =============================================================
-- 1) pii_disclosure_consents — 個人情報開示同意テーブル
--    施工店と保険会社の双方が同意した場合のみ、
--    証明書の顧客名等のPIIが保険会社に全表示される。
-- =============================================================
CREATE TABLE IF NOT EXISTS pii_disclosure_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id  uuid NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  insurer_id      uuid NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  -- 保険会社側の同意
  insurer_requested_at  timestamptz,
  insurer_requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  insurer_reason        text,  -- 事故案件番号・理由など
  -- 施工店側の同意
  tenant_consented_at   timestamptz,
  tenant_consented_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_reason         text,
  -- 状態管理
  is_active       boolean NOT NULL DEFAULT true,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (certificate_id, insurer_id)
);

CREATE INDEX IF NOT EXISTS idx_pdc_cert ON pii_disclosure_consents(certificate_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pdc_insurer ON pii_disclosure_consents(insurer_id) WHERE is_active = true;

ALTER TABLE pii_disclosure_consents ENABLE ROW LEVEL SECURITY;

-- 保険会社ユーザーは自社の同意レコードを閲覧可能
DROP POLICY IF EXISTS "pdc_select_insurer" ON pii_disclosure_consents;
CREATE POLICY "pdc_select_insurer" ON pii_disclosure_consents
  FOR SELECT USING (insurer_id IN (SELECT my_insurer_ids()));

-- テナントメンバーは自テナントの証明書に関する同意レコードを閲覧可能
DROP POLICY IF EXISTS "pdc_select_tenant" ON pii_disclosure_consents;
CREATE POLICY "pdc_select_tenant" ON pii_disclosure_consents
  FOR SELECT USING (
    certificate_id IN (
      SELECT id FROM certificates WHERE tenant_id IN (SELECT my_tenant_ids())
    )
  );

-- INSERT/UPDATE は service role (API経由) のみ

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pdc_updated_at') THEN
    CREATE TRIGGER trg_pdc_updated_at
      BEFORE UPDATE ON pii_disclosure_consents
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- =============================================================
-- 2) Helper: PII開示が双方同意済みかチェック
-- =============================================================
CREATE OR REPLACE FUNCTION is_pii_disclosed(p_certificate_id uuid, p_insurer_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pii_disclosure_consents
    WHERE certificate_id = p_certificate_id
      AND insurer_id = p_insurer_id
      AND is_active = true
      AND revoked_at IS NULL
      AND insurer_requested_at IS NOT NULL
      AND tenant_consented_at IS NOT NULL
  );
$$;

-- =============================================================
-- 3) 検索RPC更新: VIN完全一致 + PII マスキング
--    vehicle_vin を返却列に追加
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

  -- 検索: VIN完全一致を最優先、その他は部分一致
  RETURN QUERY
    SELECT
      c.public_id,
      c.status,
      -- PII マスキング: 検索結果では常にマスク
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
      '' AS latest_image_url,  -- 署名URLはAPI側で付与
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
        -- VIN 完全一致
        OR coalesce(v.vin_code, '') = p_query
        -- 以下は部分一致（利便性）
        OR c.public_id ILIKE '%' || p_query || '%'
        OR coalesce(v.plate_display, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.model, '') ILIKE '%' || p_query || '%'
        OR coalesce(v.maker, '') ILIKE '%' || p_query || '%'
        OR coalesce(c.vehicle_info_json->>'plate_display', '') ILIKE '%' || p_query || '%'
        OR coalesce(c.vehicle_info_json->>'model', '') ILIKE '%' || p_query || '%'
      )
    ORDER BY
      -- VIN完全一致を最上位にソート
      CASE WHEN coalesce(v.vin_code, '') = p_query THEN 0 ELSE 1 END,
      c.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =============================================================
-- 4) 証明書詳細RPC更新: PII開示チェック付き
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

  -- 証明書ID取得
  SELECT c.id INTO v_cert_id
  FROM certificates c WHERE c.public_id = p_public_id LIMIT 1;

  IF v_cert_id IS NULL THEN
    RAISE EXCEPTION 'Certificate not found';
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
      -- PII: 双方同意済みなら全表示、そうでなければマスク
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
-- 5) 車両検索RPC
-- =============================================================
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
    LEFT JOIN certificates c ON c.vehicle_id = v.id AND c.status IN ('active','void')
    WHERE
      p_query = ''
      OR coalesce(v.vin_code, '') = p_query  -- VIN完全一致
      OR coalesce(v.plate_display, '') ILIKE '%' || p_query || '%'
      OR coalesce(v.maker, '') ILIKE '%' || p_query || '%'
      OR coalesce(v.model, '') ILIKE '%' || p_query || '%'
    GROUP BY v.id, v.maker, v.model, v.year, v.plate_display,
             v.vin_code, v.size_class, v.tenant_id, t.name
    ORDER BY
      CASE WHEN coalesce(v.vin_code, '') = p_query THEN 0 ELSE 1 END,
      max(c.created_at) DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =============================================================
-- 6) 車両の証明書一覧RPC
-- =============================================================
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
    WHERE c.vehicle_id = p_vehicle_id AND c.status IN ('active', 'void')
    ORDER BY c.created_at DESC;
END;
$$;

-- =============================================================
-- 7) 案件管理テーブル（将来拡張の土台）
-- =============================================================
CREATE TABLE IF NOT EXISTS insurer_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id    uuid NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  certificate_id uuid REFERENCES certificates(id) ON DELETE SET NULL,
  vehicle_id    uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  case_number   text NOT NULL,
  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','pending_tenant','resolved','closed')),
  priority      text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  category      text,
  assigned_to   uuid REFERENCES insurer_users(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  closed_at     timestamptz,
  meta          jsonb DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_insurer ON insurer_cases(insurer_id, status);
CREATE INDEX IF NOT EXISTS idx_ic_number ON insurer_cases(case_number);

ALTER TABLE insurer_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ic_select" ON insurer_cases;
CREATE POLICY "ic_select" ON insurer_cases
  FOR SELECT USING (insurer_id IN (SELECT my_insurer_ids()));
DROP POLICY IF EXISTS "ic_insert" ON insurer_cases;
CREATE POLICY "ic_insert" ON insurer_cases
  FOR INSERT WITH CHECK (insurer_id IN (SELECT my_insurer_ids()));
DROP POLICY IF EXISTS "ic_update" ON insurer_cases;
CREATE POLICY "ic_update" ON insurer_cases
  FOR UPDATE USING (insurer_id IN (SELECT my_insurer_ids()));

CREATE TABLE IF NOT EXISTS insurer_case_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES insurer_cases(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'insurer'
                CHECK (sender_type IN ('insurer','tenant','system')),
  content    text NOT NULL,
  meta       jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icm_case ON insurer_case_messages(case_id, created_at);
ALTER TABLE insurer_case_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "icm_select" ON insurer_case_messages;
CREATE POLICY "icm_select" ON insurer_case_messages
  FOR SELECT USING (case_id IN (SELECT id FROM insurer_cases WHERE insurer_id IN (SELECT my_insurer_ids())));
DROP POLICY IF EXISTS "icm_insert" ON insurer_case_messages;
CREATE POLICY "icm_insert" ON insurer_case_messages
  FOR INSERT WITH CHECK (case_id IN (SELECT id FROM insurer_cases WHERE insurer_id IN (SELECT my_insurer_ids())));

-- テナント側もメッセージ閲覧・投稿可能（自テナントの案件のみ）
DROP POLICY IF EXISTS "icm_select_tenant" ON insurer_case_messages;
CREATE POLICY "icm_select_tenant" ON insurer_case_messages
  FOR SELECT USING (case_id IN (SELECT id FROM insurer_cases WHERE tenant_id IN (SELECT my_tenant_ids())));
DROP POLICY IF EXISTS "icm_insert_tenant" ON insurer_case_messages;
CREATE POLICY "icm_insert_tenant" ON insurer_case_messages
  FOR INSERT WITH CHECK (case_id IN (SELECT id FROM insurer_cases WHERE tenant_id IN (SELECT my_tenant_ids())));

CREATE TABLE IF NOT EXISTS insurer_case_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES insurer_cases(id) ON DELETE CASCADE,
  message_id  uuid REFERENCES insurer_case_messages(id) ON DELETE SET NULL,
  file_name   text NOT NULL,
  file_size   integer,
  file_type   text,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurer_case_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ica_select" ON insurer_case_attachments;
CREATE POLICY "ica_select" ON insurer_case_attachments
  FOR SELECT USING (case_id IN (SELECT id FROM insurer_cases WHERE insurer_id IN (SELECT my_insurer_ids())));
DROP POLICY IF EXISTS "ica_select_tenant" ON insurer_case_attachments;
CREATE POLICY "ica_select_tenant" ON insurer_case_attachments
  FOR SELECT USING (case_id IN (SELECT id FROM insurer_cases WHERE tenant_id IN (SELECT my_tenant_ids())));

-- Case number auto-generation
CREATE OR REPLACE FUNCTION generate_case_number_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'CASE-' || to_char(now(), 'YYYYMM') || '-' ||
      lpad(nextval('insurer_case_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS insurer_case_seq START 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_case_number') THEN
    CREATE TRIGGER trg_set_case_number
      BEFORE INSERT ON insurer_cases
      FOR EACH ROW EXECUTE FUNCTION generate_case_number_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_insurer_cases_updated_at') THEN
    CREATE TRIGGER trg_insurer_cases_updated_at
      BEFORE UPDATE ON insurer_cases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
