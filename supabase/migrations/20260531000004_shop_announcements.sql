-- 店舗お知らせ (shop_announcements): テナントが顧客向けに出すお知らせ。
--
-- 背景: 既存の `announcements` は tenant_id を持たないプラットフォーム共通お知らせで、
-- 「店舗ごとの顧客向けお知らせ」を表現できなかった。本テーブルはテナント別で、
-- auto-action `translation.auto_translate` が opt-in のテナントでは保存時に
-- title/body を英・中・越へ自動翻訳して `translations` に保持し、多言語の顧客に
-- そのまま見せられるようにする。
--
-- translations (jsonb):
--   { "en": { "title": "...", "body": "..." },
--     "zh": { "title": "...", "body": "..." },
--     "vi": { "title": "...", "body": "..." } }
--
-- - published=false は下書き (顧客に見えない)
-- - 自動翻訳は注釈的な補助であり、原文 (日本語) が常に正。壁3 とは無関係。

CREATE TABLE IF NOT EXISTS shop_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text NOT NULL,
  published     boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  translations  jsonb,
  translated_at timestamptz,
  created_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE shop_announcements IS
  'テナント別の顧客向けお知らせ。translations に英/中/越の自動翻訳を保持 (translation.auto_translate)。';
COMMENT ON COLUMN shop_announcements.translations IS
  'AI 自動翻訳 (lang -> {title, body})。原文 (日本語) が常に正。NULL = 未翻訳。';

ALTER TABLE shop_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_announcements_tenant_all ON shop_announcements;
DROP POLICY IF EXISTS shop_announcements_public_read ON shop_announcements;

-- テナントメンバーは自店のお知らせを閲覧 / 管理できる (書き込みは admin 以上)。
CREATE POLICY shop_announcements_tenant_select ON shop_announcements
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

CREATE POLICY shop_announcements_tenant_insert ON shop_announcements
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY shop_announcements_tenant_update ON shop_announcements
  FOR UPDATE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

CREATE POLICY shop_announcements_tenant_delete ON shop_announcements
  FOR DELETE USING (
    tenant_id IN (SELECT my_tenant_ids())
    AND my_tenant_role(tenant_id) IN ('owner', 'admin')
  );

-- 公開済みお知らせは顧客 (非メンバー) も閲覧可能。原文/翻訳とも顧客向けの公開情報。
CREATE POLICY shop_announcements_public_read ON shop_announcements
  FOR SELECT USING (published = true);
