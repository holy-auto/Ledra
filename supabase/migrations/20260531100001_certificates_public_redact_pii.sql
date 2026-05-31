-- certificates_public ビューから公開 (anon) 向けの PII 2 列を伏せる。
--
-- 背景: certificates_public は security_invoker = on で anon キーから REST 参照される
-- 唯一の公開ビュー (公開証明書 PDF: /api/certificate/pdf)。これまで c.customer_name と
-- c.content_free_text をそのまま公開していたため、public_id を知る第三者が anon キーで
-- REST (select=*) を直接叩くと、アプリ層の伏字処理を迂回して所有者名・自由記述メモを
-- 取得できてしまっていた。
--
-- 対策: 列名・順序・型・GRANT を一切変えずに CREATE OR REPLACE VIEW で再定義し、
-- customer_name と content_free_text の値だけを NULL::text に差し替える。
--   - DROP 不要 (列名/型/順序が同一のため CREATE OR REPLACE で置換可能) → 既存 GRANT を保持。
--   - 列自体は残るため、想定外の anon 利用者が居てもエラーにならず値が null になるだけ。
--   - content_preset_json / vehicle_info_json は従来どおり公開 (公開ページで表示する内容)。
-- 公開PDF (/api/certificate/pdf) は既に customer_name/content_free_text を破棄しているため影響なし。
-- 元定義: 20260531000006_security_invoker_views.sql

CREATE OR REPLACE VIEW public.certificates_public
WITH (security_invoker = on) AS
SELECT
  c.public_id,
  c.status,
  NULL::text AS customer_name,      -- 公開 (anon) では伏せる (PII)
  c.vehicle_info_json,
  NULL::text AS content_free_text,  -- 公開 (anon) では伏せる (PII)
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
