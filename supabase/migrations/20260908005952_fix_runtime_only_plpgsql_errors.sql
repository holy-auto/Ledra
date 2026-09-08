-- 実行時にしか落ちない plpgsql の不具合を2件直す。
--
-- どちらも plpgsql_check を replay-migrations.mjs に足したときに出てきたもので、
-- マイグレーションも型検査も CI も素通りしていた（plpgsql の本体は CREATE 時に
-- 構文しか検証されず、名前や演算子の解決は実行時まで行われない）。
-- どちらも本番で症状を確認済み。
--
-- 1) agent_rankings: date >= text の比較で必ず 42883。
--    本番で `select public.agent_rankings('month')` を実行して再現済み。
--    呼び出し元 /api/agent/rankings は rpc の error を受け取らずに data だけを
--    見ているため、**200 で空のランキング**が返っていた（画面には「該当なし」）。
--
-- 2) insurer_get_certificate: RETURNS TABLE の出力列 tenant_id と、
--    insurer_tenant_access.tenant_id が同名で 42702（column reference is ambiguous）。
--    plpgsql の variable_conflict は既定で error なので、アクセス確認の IF に
--    入った時点で必ず落ちる。is_pii_disclosed（20260907000000 で修正）を呼ぶ手前で
--    死ぬので、保険会社ポータルの証明書詳細は**一度も成功していない**
--    （insurer_access_logs の action='view' は本番で0件）。
--
-- シグネチャ・返り値・言語・SECURITY DEFINER は現行のまま。可視範囲も権限も広げない。
-- あわせて両方とも search_path を '' に締め、本体の参照を public. で修飾した
-- （lint-migrations の security-definer-mutable-search-path。この2本は
-- 20260404000000 の一括適用から漏れて 'public, extensions' のまま残っていた）。
-- 締めた結果、上の非修飾参照の検査（pg_get_functiondef の流し直し）の対象にも入る。

-- 1) date と text を比べていたのをやめる。period_start は date。
CREATE OR REPLACE FUNCTION public.agent_rankings(p_period text DEFAULT 'month'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start date;
  v_result jsonb;
begin
  if p_period = 'month' then
    v_start := date_trunc('month', now())::date;
  elsif p_period = 'quarter' then
    v_start := date_trunc('quarter', now())::date;
  elsif p_period = 'year' then
    v_start := date_trunc('year', now())::date;
  else
    v_start := date_trunc('month', now())::date;
  end if;

  select jsonb_agg(row_to_json(t)::jsonb order by t.referral_count desc)
  into v_result
  from (
    select
      a.id as agent_id,
      a.name as agent_name,
      count(r.id) as referral_count,
      count(r.id) filter (where r.status = 'contracted') as contracted_count,
      case when count(r.id) > 0
        then round(count(r.id) filter (where r.status = 'contracted')::numeric / count(r.id) * 100, 1)
        else 0 end as conversion_rate,
      coalesce(sum(c.amount) filter (where c.status in ('approved','paid')), 0) as total_commission
    from public.agents a
    left join public.agent_referrals r on r.agent_id = a.id and r.created_at >= v_start
    left join public.agent_commissions c on c.agent_id = a.id and c.period_start >= v_start
    where a.status = 'active'
    group by a.id, a.name
  ) t;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

-- 2) 出力列 tenant_id と衝突していた参照に別名を付ける（本体のロジック変更はここだけ）。
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
