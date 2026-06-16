-- ⑦ 職人名×施工証明の連携: 証明書に施工担当（職人）を記録
--
-- 背景:
--   ⑥ で reservations.assigned_staff_id（施工担当=職人）を導入した。これを
--   施工証明書にスナップショットとして刻み、公開証明書（車両とともに次の
--   オーナーへ引き継がれる）に「○年○月○日 △△氏 施工・証明済み」を表示する。
--   将来はブロックチェーンアンカーの canonical payload にも craftsman_name を
--   含める（certificateHashing で omit-when-absent 実装、既存 v1 ダイジェスト互換）。
--
-- 設計:
--   - craftsman_staff_id: staff_members 参照（削除時 SET NULL）
--   - craftsman_name: 発行時点の表示名スナップショット（職人退会後も証跡が残る）
--   - craftsman_name は個人情報（顧客 PII）ではない職人の職業上の名前 → 公開可。

alter table certificates
  add column if not exists craftsman_staff_id uuid references staff_members(id) on delete set null;

alter table certificates
  add column if not exists craftsman_name text;

comment on column certificates.craftsman_name is
  '施工担当（職人）の表示名。発行時スナップショット。公開証明書に表示し、将来アンカーにも記録。';

-- certificates_public ビューへ craftsman_name を末尾追加（PII ではないため公開可）。
-- 末尾追加のみなので CREATE OR REPLACE VIEW で既存の列順・型・GRANT を保持できる。
-- 元定義: 20260531100001_certificates_public_redact_pii.sql
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
  tpc.tenant_custom_domain,
  c.craftsman_name                  -- 施工担当（職人）。PII ではないため公開。
FROM public.certificates c
LEFT JOIN LATERAL public.certificate_public_tenant(c.tenant_id) tpc ON true;
