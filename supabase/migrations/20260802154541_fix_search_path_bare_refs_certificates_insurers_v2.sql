-- =============================================================
-- 20260802154302 の追い修正 (v2) — 本番から復元したファイル
--
-- このマイグレーションは 2026-08-02 に Supabase MCP `apply_migration` で本番
-- (cahybswpduchptvyvdkk) へ直接適用され、`schema_migrations` にバージョン
-- 20260802154541 として記録されたが、対応するファイルがリポジトリに存在しなかった。
-- そのためリポジトリと本番履歴が乖離し、`supabase db push` が
--   "Remote migration versions not found in local migrations directory."
-- で 2026-08-02 以降ずっと失敗していた（OPEN_QUESTIONS 2026-08-05 追記）。
--
-- 本ファイルの内容は本番 `schema_migrations.statements` から復元したもので、
-- 実際に適用された SQL と一致する。本番では記録済みのため再実行されない
-- （プレビュー/新規環境の再生時のみ実行される）。
--
-- 内容: 20260802154302 が直した4関数のうち2関数について、status 比較を
-- `status::text` 化して enum に無い 'expired' でも例外にしない追い修正。
-- =============================================================

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
