-- 保険会社 RPC の認可を、ルート層だけでなく DB 側にも置く（Codex P1 / PR #1097 の残件）。
--
-- ## 何が問題だったか
--
-- ルート層 `resolveInsurerCaller`（src/lib/api/insurerAuth.ts）は
--   insurers.is_active = true AND insurers.status IN ('active','active_pending_review')
-- を見て、停止中（suspended）の保険会社を 401 で止める。
-- ところが RPC 側は `insurer_users.is_active` しか見ていなかった。
-- これらは PostgREST に公開された SECURITY DEFINER 関数なので、
-- **ブラウザの認証済みセッションから直接叩けば、ルート層のガードを素通りする。**
--
-- 本番で実測したところ、`insurer_users` を読む SECURITY DEFINER 関数は 17 本あり、
-- `insurers` 行まで見ていたのは `get_my_insurer_status` と `withdraw_insurer` の2本だけだった。
-- 顧客データを返す5本が揃って素通りしていた。
--
-- ## 直し方 —— 規則を1箇所にする
--
-- 5本それぞれに `join insurers` を足すと、次に増えた6本目がまた漏れる。
-- 判定を `public.current_insurer_access()` 1本に閉じ込め、5本はそれを呼ぶだけにする。
-- 以後この規則を変えるときに触る場所は1箇所。
--
-- 並び順は `resolveInsurerCaller` に合わせて `created_at asc`（従来 RPC は順序指定なしの
-- LIMIT 1、`current_insurer_id()` は desc で、3者がばらばらだった）。
-- **複数の保険会社に属するユーザで「どの保険会社として見ているか」を
-- クッキーの文脈に合わせる件は、これとは別**（RPC のシグネチャ変更が要る。
-- 該当ユーザは現在0人。OPEN_QUESTIONS に残す）。
--
-- ## 範囲
--
-- この版が変えるのは**顧客データを返す5本**だけ。
--   insurer_search_vehicles / insurer_search_certificates / insurer_search_stores
--   insurer_get_certificate / insurer_get_vehicle_certificates
--
-- `my_insurer_ids()` は**変えない**。14 本の RLS ポリシー（insurers / insurer_users /
-- insurer_cases / insurer_case_messages / insurer_case_attachments /
-- insurer_tenant_access / pii_disclosure_consents / ai_usage_logs）が使っており、
-- 停止中に自社の行まで見えなくすると「アカウント停止中」画面の周辺が壊れる。
-- 停止時に切るべきは**他社テナントの顧客データ**であって、自社の管理画面ではない。
-- RLS 側をどう扱うかは OPEN_QUESTIONS に残す。
--
-- ## 検査
--
-- `scripts/replay/checks/insurer_suspension_gate.sql` が、再生 DB に実際の行を入れて
-- 「active は通る / suspended は通さない / is_active=false は通さない」を確かめる。
-- `npm run check:migrations` から毎回走る（壊れたら落ちる）。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 判定を1箇所に置く
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_insurer_access()
RETURNS TABLE (insurer_user_id uuid, insurer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT iu.id, iu.insurer_id
  FROM public.insurer_users iu
  JOIN public.insurers i ON i.id = iu.insurer_id
  WHERE iu.user_id = auth.uid()
    AND iu.is_active = true
    AND i.is_active = true
    AND i.status IN ('active', 'active_pending_review')
  ORDER BY iu.created_at ASC NULLS LAST
  LIMIT 1
$$;

COMMENT ON FUNCTION public.current_insurer_access() IS
  '保険会社ユーザが顧客データを読んでよいかを判定する唯一の場所。insurer_users.is_active に加えて insurers.is_active と status（active / active_pending_review）まで見る。src/lib/api/insurerAuth.ts の resolveInsurerCaller と同じ規則・同じ並び順。';

REVOKE ALL ON FUNCTION public.current_insurer_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_insurer_access() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 車両検索
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insurer_search_vehicles(
  p_query      text DEFAULT ''::text,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
BEGIN
  SELECT a.insurer_user_id, a.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.current_insurer_access() a;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'vehicle_search',
    jsonb_build_object('query', p_query), p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      v.id AS vehicle_id,
      v.maker, v.model, v.year, v.plate_display, v.vin_code, v.size_class,
      v.tenant_id,
      t.name AS tenant_name,
      count(c.id) AS certificate_count,
      (SELECT c2.public_id FROM public.certificates c2
       WHERE c2.vehicle_id = v.id AND c2.status::text IN ('active', 'void', 'expired')
       ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_public_id,
      (SELECT c2.status::text FROM public.certificates c2
       WHERE c2.vehicle_id = v.id AND c2.status::text IN ('active', 'void', 'expired')
       ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_status,
      (SELECT c2.created_at FROM public.certificates c2
       WHERE c2.vehicle_id = v.id AND c2.status::text IN ('active', 'void', 'expired')
       ORDER BY c2.created_at DESC LIMIT 1) AS latest_cert_created_at
    FROM public.vehicles v
    LEFT JOIN public.tenants t ON t.id = v.tenant_id
    LEFT JOIN public.certificates c ON c.vehicle_id = v.id AND c.status::text IN ('active', 'void', 'expired')
    WHERE
      v.tenant_id IN (SELECT public.insurer_accessible_tenant_ids(v_insurer_id))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 証明書検索
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insurer_search_certificates(
  p_query      text DEFAULT ''::text,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE (
  public_id text, status text, customer_name text, vehicle_model text,
  vehicle_plate text, vehicle_vin text, vehicle_maker text, vehicle_year integer,
  vehicle_id uuid, image_count bigint, latest_image_url text, service_type text,
  created_at timestamptz, tenant_id uuid, tenant_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
BEGIN
  SELECT a.insurer_user_id, a.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.current_insurer_access() a;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
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
      (SELECT count(*)::bigint FROM public.certificate_images ci WHERE ci.certificate_id = c.id) AS image_count,
      ''::text AS latest_image_url,
      coalesce(c.service_type, '')::text AS service_type,
      c.created_at,
      c.tenant_id,
      coalesce(t.name, '')::text AS tenant_name
    FROM public.certificates c
    LEFT JOIN public.vehicles v ON v.id = c.vehicle_id
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
    WHERE
      c.status::text IN ('active', 'void')
      AND c.tenant_id IN (SELECT public.insurer_accessible_tenant_ids(v_insurer_id))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) 店舗検索
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insurer_search_stores(
  p_query      text DEFAULT ''::text,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0,
  p_ip         text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE (
  store_id uuid, store_name text, store_address text, store_phone text,
  store_email text, store_manager text, store_hours jsonb,
  tenant_id uuid, tenant_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
BEGIN
  SELECT a.insurer_user_id, a.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.current_insurer_access() a;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
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
    FROM public.stores s
    JOIN public.tenants t ON t.id = s.tenant_id
    WHERE
      s.is_active = true
      AND s.tenant_id IN (SELECT public.insurer_accessible_tenant_ids(v_insurer_id))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) 証明書詳細
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insurer_get_certificate(
  p_public_id  text,
  p_ip         text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid, public_id text, status text, customer_name text, pii_disclosed boolean,
  vehicle_model text, vehicle_plate text, vehicle_vin text, vehicle_maker text,
  vehicle_year integer, vehicle_id uuid, service_type text, certificate_no text,
  content_free_text text, content_preset_json jsonb, expiry_type text, expiry_value text,
  warranty_period_end date, ppf_coverage_json jsonb, coating_products_json jsonb,
  maintenance_json jsonb, body_repair_json jsonb,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  tenant_id uuid, tenant_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_cert_id uuid;
  v_cert_tenant_id uuid;
  v_pii_ok boolean;
BEGIN
  SELECT a.insurer_user_id, a.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.current_insurer_access() a;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  -- 下書きは保険会社に見せない（20260326100000 の方針: draft のみ非表示）。
  -- 存在自体を漏らさないよう、見つからなかったときと同じ経路に落とす。
  SELECT c.id, c.tenant_id INTO v_cert_id, v_cert_tenant_id
  FROM public.certificates c
  WHERE c.public_id = p_public_id
    AND c.status::text IN ('active', 'void', 'expired')
  LIMIT 1;

  IF v_cert_id IS NULL THEN
    RAISE EXCEPTION 'Certificate not found';
  END IF;

  -- ita で修飾する。修飾しないと出力列の tenant_id と衝突して 42702 で落ちる
  IF NOT EXISTS (
    SELECT 1 FROM public.insurer_tenant_access ita
    WHERE ita.insurer_id = v_insurer_id
      AND ita.tenant_id = v_cert_tenant_id
      AND ita.is_active = true
      AND ita.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied: insurer does not have access to this tenant';
  END IF;

  v_pii_ok := public.is_pii_disclosed(v_cert_id, v_insurer_id);

  INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, certificate_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, v_cert_id, 'view',
    jsonb_build_object('public_id', p_public_id, 'pii_disclosed', v_pii_ok),
    p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      c.id,
      c.public_id,
      c.status::text,
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
      c.expiry_type::text,
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
    FROM public.certificates c
    LEFT JOIN public.vehicles v ON v.id = c.vehicle_id
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
    WHERE c.id = v_cert_id
    LIMIT 1;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) 車両ごとの証明書一覧
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insurer_get_vehicle_certificates(
  p_vehicle_id uuid,
  p_ip         text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE(
  certificate_id uuid, public_id text, status text, customer_name text,
  service_type text, certificate_no text, created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_vehicle_tenant_id uuid;
BEGIN
  SELECT a.insurer_user_id, a.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.current_insurer_access() a;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  SELECT v.tenant_id INTO v_vehicle_tenant_id
  FROM public.vehicles v WHERE v.id = p_vehicle_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.insurer_tenant_access
    WHERE insurer_id = v_insurer_id
      AND tenant_id = v_vehicle_tenant_id
      AND is_active = true
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.insurer_access_logs (insurer_id, insurer_user_id, action, meta, ip, user_agent)
  VALUES (v_insurer_id, v_insurer_user_id, 'vehicle_view',
    jsonb_build_object('vehicle_id', p_vehicle_id), p_ip, p_user_agent);

  RETURN QUERY
    SELECT
      c.id AS certificate_id,
      c.public_id,
      c.status::text,
      CASE WHEN length(c.customer_name) > 1
        THEN left(c.customer_name, 1) || '***' ELSE '***'
      END AS customer_name,
      c.service_type,
      c.certificate_no,
      c.created_at
    FROM public.certificates c
    WHERE c.vehicle_id = p_vehicle_id AND c.status::text IN ('active', 'void', 'expired')
    ORDER BY c.created_at DESC;
END;
$function$;
