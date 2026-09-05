-- 4 ビューを SECURITY DEFINER から security_invoker へ移行する。
--
-- 背景: Supabase Advisor が以下 4 ビューを CRITICAL (lint 0010_security_definer_view)
-- として検出した。これらは作成者 (postgres) 権限で実行されるため、参照ユーザーの
-- RLS を迂回してしまう。
--   - public.certificates_public
--   - public.invoices
--   - public.partner_score_view
--   - public.v_insurer_users_list
-- 対策は各ビューを security_invoker = on にし、呼び出しロールの RLS を適用させること。
-- 参考: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
--
-- ── 各ビューの呼び出し経路と影響 ──────────────────────────────────────────
-- invoices              … サーバー側 API のみが service-role キーで参照 (RLS は元々
--                         バイパス)。invoker 化は実質 no-op。
-- partner_score_view    … anon / authenticated からの呼び出し無し。invoker 化で将来の
-- v_insurer_users_list    認証済み呼び出しには本来の RLS が効く (より安全) 。get_auth_email_scoped
--                         は SECURITY DEFINER のため invoker 配下でも email 解決は維持される。
-- certificates_public   … 唯一 anon キーで参照される (公開証明書 PDF: /api/certificate/pdf)。
--                         元定義は certificates JOIN tenants。tenants には anon 用 SELECT ポリシーが
--                         無いため、単純な invoker 化では anon の内部結合が 0 件になり公開 PDF が壊れる。
--                         → tenants の「公開ブランディング 3 列」だけを返す最小の SECURITY DEFINER
--                           関数 certificate_public_tenant() を経由させ、anon に tenants 全体の
--                           参照権を与えずに invoker 化する。certificates 側は既存の anon ポリシー
--                           (active 証明書のみ参照可) がそのまま効く。

-- 1) 公開証明書ビュー専用のテナント公開列ヘルパー。
--    tenants の name / slug / custom_domain のみを返す最小公開関数。
--    search_path を空に固定し、参照は全て schema 修飾する (function_search_path_mutable 回避)。
CREATE OR REPLACE FUNCTION public.certificate_public_tenant(p_tenant_id uuid)
RETURNS TABLE (tenant_name text, tenant_slug text, tenant_custom_domain text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.name, t.slug, t.custom_domain
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
$$;

COMMENT ON FUNCTION public.certificate_public_tenant(uuid) IS
  'certificates_public ビュー専用。tenants の公開ブランディング列 (name/slug/custom_domain) のみを返す。'
  'ビューを security_invoker 化しても anon が tenants 全体への RLS 権限なしに必要列だけ参照できるようにするための最小公開関数。';

-- 公開ビュー経路 (anon) と既存の利用ロールに EXECUTE を明示付与する。
GRANT EXECUTE ON FUNCTION public.certificate_public_tenant(uuid) TO anon, authenticated, service_role;

-- 2) certificates_public を security_invoker = on で再作成する。
--    出力列・順序・型は従来と完全に一致させる (CREATE OR REPLACE で既存 GRANT を保持)。
--    tenants 列はヘルパー関数経由 (LATERAL) で取得し、anon には active 証明書のみ見える。
CREATE OR REPLACE VIEW public.certificates_public
WITH (security_invoker = on) AS
SELECT
  c.public_id,
  c.status,
  c.customer_name,
  c.vehicle_info_json,
  c.content_free_text,
  c.content_preset_json,
  c.expiry_type,
  c.expiry_value,
  c.logo_asset_path,
  c.footer_variant,
  c.current_version,
  c.created_at,
  tpc.tenant_name,
  tpc.tenant_slug,
  tpc.tenant_custom_domain
FROM public.certificates c
LEFT JOIN LATERAL public.certificate_public_tenant(c.tenant_id) tpc ON true;

-- 3) 残り 3 ビューを security_invoker = on に切り替える (呼び出しロールの RLS を適用)。
-- 【後から内容だけ修正】v_insurer_users_list は**どのマイグレーションでも作られない**
-- （本番にだけある。20260826000005 のコメント参照）。空 DB へ1パスで流すとここで落ち、
-- このファイルが丸ごと巻き戻るため、上で作る certificate_public_tenant まで消えて
-- 後続が連鎖して落ちていた。無いビューは飛ばす。
DO $mig$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['public.invoices', 'public.partner_score_view', 'public.v_insurer_users_list'] LOOP
    IF to_regclass(v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = on)', v);
    END IF;
  END LOOP;
END
$mig$;
