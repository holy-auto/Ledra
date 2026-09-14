-- 実行時にしか落ちない plpgsql の不具合を直す（insurer_get_certificate）。
--
-- plpgsql_check を replay-migrations.mjs に足したときに出てきたもので、
-- マイグレーションも型検査も CI も素通りしていた（plpgsql の本体は CREATE 時に
-- 構文しか検証されず、名前や演算子の解決は実行時まで行われない）。
--
-- insurer_get_certificate: RETURNS TABLE の出力列 tenant_id と、
-- insurer_tenant_access.tenant_id が同名で 42702（column reference is ambiguous）。
-- plpgsql の variable_conflict は既定で error なので、アクセス確認の IF に
-- 入った時点で必ず落ちる。is_pii_disclosed（20260907000000 で修正）を呼ぶ手前で
-- 死ぬので、保険会社ポータルの証明書詳細は**一度も成功していない**
-- （insurer_access_logs の action='view' は本番で0件）。
--
-- シグネチャ・返り値・言語・SECURITY DEFINER は現行のまま。可視範囲も権限も広げない。
-- あわせて search_path を '' に締め、本体の参照を public. で修飾した
-- （lint-migrations の security-definer-mutable-search-path。この関数は
-- 20260404000000 の一括適用から漏れて 'public, extensions' のまま残っていた）。
-- 締めた結果、非修飾参照の検査（pg_get_functiondef の流し直し）の対象にも入る。
--
-- 当初はこの版で agent_rankings（date >= text の 42883）も一緒に直していたが、
-- 取り下げた。20260908131725 が型不一致を、20260909003200 が JOIN のファンアウトを
-- 先に直して本番へ入っており、そちらには「有効な代理店ユーザーであること」の
-- 認可チェックが付いている。この版は本番の最大版より後ろに来るので、
-- agent_rankings を含めたままだと最後に適用されてその認可チェックを消してしまう。

-- 出力列 tenant_id と衝突していた参照に別名を付ける（本体のロジック変更はここだけ）。
CREATE OR REPLACE FUNCTION public.insurer_get_certificate(p_public_id text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, public_id text, status text, customer_name text, pii_disclosed boolean, vehicle_model text, vehicle_plate text, vehicle_vin text, vehicle_maker text, vehicle_year integer, vehicle_id uuid, service_type text, certificate_no text, content_free_text text, content_preset_json jsonb, expiry_type text, expiry_value text, warranty_period_end date, ppf_coverage_json jsonb, coating_products_json jsonb, maintenance_json jsonb, body_repair_json jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, tenant_id uuid, tenant_name text)
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
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

  IF v_insurer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not an active insurer user';
  END IF;

  SELECT c.id, c.tenant_id INTO v_cert_id, v_cert_tenant_id
  FROM public.certificates c WHERE c.public_id = p_public_id LIMIT 1;

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
    FROM public.certificates c
    LEFT JOIN public.vehicles v ON v.id = c.vehicle_id
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
    WHERE c.public_id = p_public_id
    LIMIT 1;
END;
$function$;
