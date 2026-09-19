-- Codex レビュー P1 の2件を直す。どちらも 20260919132119 / 20260919134412 で
-- 関数が「実際に動くようになった」ことで初めて到達可能になったもの。
--
-- (1) 下書き証明書が保険会社に漏れる
--     insurer_search_vehicles の最新証明書サブクエリ3本には status の条件が無く、
--     LEFT JOIN 側の条件が効かない。最新が draft の車両では draft の public_id /
--     status / created_at を返す。その public_id を insurer_get_certificate に
--     渡すと、こちらも status を見ていないので本文と JSON を返す。
--     方針は 20260326100000 の冒頭どおり「active + void + expired を表示、draft のみ非表示」。
--     本番に draft の証明書は現在1件ある（実測）。
--     兄弟の insurer_get_vehicle_certificates と insurer_search_certificates は
--     既に draft を除いているので、漏れていたのはこの2関数だけ。
--
-- (2) オーバーロードの曖昧さ
--     insurer_search_vehicles には5引数版と6引数版があり、6引数版の p_status は
--     既定値つき。アプリが送る5つの名前付き引数は両方に一致しうるため、PostgREST が
--     RPC を解決できず本体に入る前に弾く可能性がある。
--     6引数版は本番から消えた insurer_is_active_subscription を呼ぶので**呼ばれれば
--     必ず 42883**、かつ repo 全体で呼び出し元は0件（`grep -rn insurer_search_vehicles`
--     で出るのは src/app/api/insurer/vehicles/route.ts の5引数呼び出しと
--     src/types/db.generated.ts の2件のみ）。残す理由が無いので落とす。
--     これで OPEN_QUESTIONS の「6引数オーバーロードをどうするか」も解決する。
--
-- ここで**直していない** P1 が2件ある。どちらもこの PR より広いので別 PR（OPEN_QUESTIONS）:
--
--   - **停止中の保険会社が RPC を直接叩けてしまう。** ルート層の resolveInsurerCaller は
--     `insurers.is_active = true AND status IN ('active','active_pending_review')` を見るが、
--     RPC 側は insurer_users.is_active しか見ないので PostgREST 直叩きは素通りする。
--     ただしこれは**この2関数だけの話ではない** —— 本番で insurer_users を読む
--     SECURITY DEFINER 関数 17 本のうち、insurers 行まで見ているのは
--     get_my_insurer_status と withdraw_insurer の2本だけ。
--     insurer_search_certificates / insurer_search_stores /
--     insurer_get_vehicle_certificates も同じ穴を持つ。
--     根の共有関数は my_insurer_ids() と current_insurer_id() で、そこを直すと
--     保険会社系の RLS ポリシー全部に波及する。1本ずつ塞ぐと同じ漏れを量産するので、
--     共有関数側で判断する。
--
--   - **複数保険会社に属するユーザで、RPC が active_insurer_id クッキーの文脈を捨てる。**
--     insurer_users を条件なし LIMIT 1 で拾うので、別の保険会社のテナントを検索し、
--     アクセスログもその保険会社に付く可能性がある。
--     現在そのようなユーザは **0人**（`select count(*) from (select user_id from
--     insurer_users where is_active group by user_id having count(distinct insurer_id) > 1)`
--     で実測。有効なメンバーシップは全4件）。直すには RPC のシグネチャ変更と
--     呼び出し側の変更が要るので、この PR には混ぜない。
--
-- 適用順: 本番へは手で適用済み（版 20260919150043 ＝ 適用時刻。ファイル名も合わせてある）。

DROP FUNCTION IF EXISTS public.insurer_search_vehicles(text, integer, integer, text, text, text);

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
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

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
      -- 下書きを最新として拾わない。LEFT JOIN 側と同じ条件をサブクエリにも置く
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
