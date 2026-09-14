-- =============================================================
-- 注記(2026-08-15): このファイルは元 `20260802000000_...sql` を改名したもの。
-- 本番 schema_migrations には同名で 20260802154302 として記録されている一方、
-- リポジトリ側は 20260802000000 のままだったため、db push が
-- "Remote migration versions not found in local migrations directory." で
-- 停止していた。バージョンを本番の記録に合わせて解消した（DECISION_LOG 2026-08-15）。
--
-- 内容について: 本番の 20260802154302 の記録には status::text 化が入っておらず、
-- それは直後の 20260802154541 (v2) で入っている。このファイルは status::text を
-- 含んだ最終形なので、記録された 20260802154302 そのものとは厳密には一致しない。
-- どちらも CREATE OR REPLACE FUNCTION のみで冪等、かつ本番では両方とも記録済みで
-- 再実行されないため実害は無い。新規環境で 154302 → 154541 の順に再生した場合も
-- 最終状態は本番と一致する。
-- =============================================================

-- SECURITY DEFINER 関数の search_path='' 下でのバレ参照修正（第2弾）
--
-- 事象(1) バレ参照:
--   20260404000000_fix_security_definer_search_path.sql が多数の SECURITY DEFINER
--   関数に `SET search_path = ''` を付けたが、関数本体のテーブル参照を public. 修飾に
--   直さなかったため、以後これらは実行時に "relation \"certificates\"/\"insurers\"
--   does not exist" で必ず失敗していた（本番 cahybswpduchptvyvdkk のログで継続発生）。
--   20260725125332_fix_security_definer_search_path_bare_refs.sql は同種の他関数を
--   修正したが、以下4関数を取りこぼしていた。
--
-- 事象(2) enum の 'expired' 参照:
--   certificate_status_enum は (active, void, draft) のみで 'expired' を持たない
--   （20260329200001_fix_search_status_enum.sql で確立: enum に 'expired' は無い、
--    関数側から除く方針）。platform_certificate_stats と
--   insurer_get_vehicle_certificates はこの修正から漏れ 'expired' を参照したままで、
--   バレ参照を直すと今度は "invalid input value for enum ... 'expired'" で落ちる。
--
-- 対応:
--   4関数を CREATE OR REPLACE し、(1) 本体のテーブル参照を全て public. 修飾、
--   (2) status の比較を status::text にして 'expired'（enum に無い値）でも enum
--   キャスト例外を出さないようにする（既存 insurer_search_certificates と同じ手法）。
--   `SET search_path = ''`（ハイジャック対策）は維持。JSON 出力の形（'expired' キー）も
--   保つ（該当は常に 0）。影響: 証明書料金取得 / 保険会社ポータルの車両別証明書一覧 /
--   プラットフォーム統計（証明書数・保険会社数）。

-- ── 1. get_certificate_service_price ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_certificate_service_price(cert_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  price integer;
BEGIN
  SELECT service_price INTO price FROM public.certificates WHERE id = cert_id;
  RETURN price;
END;
$function$;

-- ── 2. platform_certificate_stats ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_certificate_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (WHERE status::text = 'active'),
    'void', COUNT(*) FILTER (WHERE status::text = 'void'),
    'expired', COUNT(*) FILTER (WHERE status::text = 'expired'),
    'draft', COUNT(*) FILTER (WHERE status::text = 'draft')
  ) INTO result
  FROM public.certificates;
  RETURN result;
END;
$function$;

-- ── 3. platform_insurer_count ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_insurer_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*) from public.insurers;
$function$;

-- ── 4. insurer_get_vehicle_certificates ──────────────────────────────────────
-- 本体の全テーブル参照を public. 修飾（auth.uid() は元から修飾済み）。
CREATE OR REPLACE FUNCTION public.insurer_get_vehicle_certificates(p_vehicle_id uuid, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(certificate_id uuid, public_id text, status text, customer_name text, service_type text, certificate_no text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_insurer_user_id uuid;
  v_insurer_id uuid;
  v_vehicle_tenant_id uuid;
BEGIN
  SELECT iu.id, iu.insurer_id
  INTO v_insurer_user_id, v_insurer_id
  FROM public.insurer_users iu
  WHERE iu.user_id = auth.uid() AND iu.is_active = true
  LIMIT 1;

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
