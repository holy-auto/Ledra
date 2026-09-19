-- insurer_get_certificate（保険会社ポータルの証明書詳細）が 42804 で落ちていたのを直す。
--
-- `RETURNS TABLE` は `status` も `expiry_type` も `text` と宣言しているが、本番の
-- `certificates` ではどちらも enum（`certificate_status_enum` / `expiry_type_enum`）。
-- `RETURN QUERY` は enum→text の暗黙変換をしないので、必ずこうなる:
--   error:42804:RETURN QUERY:structure of query does not match function result type
--
-- 直前の `20260919132119`（`insurer_search_vehicles`）と**同じ種類の誤り**で、
-- そこでは見つけられなかった。理由は検出の仕方 —— あちらでは `'expired'` という
-- **リテラルを grep** して「残り0本」と結論した。それは 22P02（enum に無い値）だけの
-- 検出で、**enum を text の返り値に入れる側（42804）を一度も走査していない**。
-- `/code-review` がそれを指摘し、この関数が残っていることが分かった
-- （MISTAKE_LEDGER `M-20260919-swept-for-the-literal-not-the-bug-class`）。
--
-- 今回の検出は grep ではなく **`plpgsql_check` を本番の全 plpgsql 関数に回した**:
--   select p.oid::regprocedure::text, m
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        join pg_language l on l.oid = p.prolang
--        cross join lateral plpgsql_check_function(p.oid) as m
--   where n.nspname='public' and l.lanname='plpgsql' and p.prokind='f'
--     and not exists (select 1 from pg_type t where t.oid=p.prorettype and t.typname='trigger')
--     and m like 'error:%';
-- 本体の書き方に依らず、**壊れている関数そのもの**が出る。適用後にこの走査で残るのは
-- `insurer_search_vehicles(text,integer,integer,text,text,text)` の 42883 のみで、
-- これは誰からも呼ばれていない6引数オーバーロード（OPEN_QUESTIONS に起票済み）。
--
-- 変更は `c.status` と `c.expiry_type` への `::text` キャストのみ。それ以外は本番の
-- `pg_get_functiondef` と同一（`search_path TO ''` と schema 修飾も既にそうなっている）。
--
-- 適用順: 本番が落ちていたので、このファイルは db-migrate ではなく手で本番に当て済み
-- （`supabase_migrations.schema_migrations` の `20260919134412` ＝ 適用時刻。
-- ファイル名もそれに合わせてあるので、次の `supabase db push` はこの版を再実行しない）。
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
    WHERE c.public_id = p_public_id
    LIMIT 1;
END;
$function$;
