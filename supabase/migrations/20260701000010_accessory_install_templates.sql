-- 用品取付 (Accessory Installation) 証明書テンプレートサポート
--
-- 整備 (maintenance) / 鈑金塗装 (body_repair) と同じ「カテゴリ駆動」の仕組みで、
-- 用品取付（カーナビ・ETC・ドラレコ等の取り付け）専用の証明書テンプレートを追加する。
--   1. certificates.accessory_json カラム追加（取付内容の構造化データ）
--   2. platform_templates / templates の category CHECK に 'accessory' を追加
--   3. スタンダードテンプレート（共通・tenant_id NULL）を templates に追加
--   4. ブランド証明書テンプレートを platform_templates に追加
--
-- 破壊的変更なし: 追加カラムは nullable / 既定値あり。CHECK 拡張は既存行を必ず
-- 満たすため NOT VALID で追加後 VALIDATE する（対象は少数のプラットフォーム行）。

-- 1. certificates テーブルに accessory_json カラム追加
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS accessory_json jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN certificates.accessory_json IS
  '用品取付記録 {accessory_types, product_name, maker_name, install_location, serial_no, install_notes, warranty_info, installer_name}';

-- 2. platform_templates.category の CHECK制約を更新して accessory を追加
ALTER TABLE platform_templates
  DROP CONSTRAINT IF EXISTS platform_templates_category_check;
ALTER TABLE platform_templates
  ADD CONSTRAINT platform_templates_category_check
  CHECK (category IN ('coating', 'detailing', 'maintenance', 'general', 'ppf', 'body_repair', 'accessory'))
  NOT VALID;
ALTER TABLE platform_templates
  VALIDATE CONSTRAINT platform_templates_category_check;

-- 3. 用品取付スタンダードテンプレートを共通テンプレート（tenant_id NULL）として追加
--    新規発行ページのテンプレート選択に出て、category='accessory' でフォームを切り替える。
INSERT INTO templates (tenant_id, scope, name, category, schema_json, layout_version)
VALUES (
  NULL, 'tenant', '用品取付スタンダード', 'accessory',
  '{"version":1,"sections":[]}'::jsonb, 1
)
ON CONFLICT DO NOTHING;

-- 4. 用品取付ブランド証明書テンプレートを platform_templates に追加
INSERT INTO platform_templates (name, description, category, layout_key, base_config, sort_order)
VALUES (
  '用品取付スタンダード',
  'カーナビ・ETC・ドラレコ等の用品取付の施工証明書テンプレート',
  'accessory',
  'standard',
  '{
    "version": 1,
    "branding": { "company_name": "" },
    "header": {
      "title": "用品取付証明書",
      "show_issue_date": true,
      "show_certificate_no": true
    },
    "body": {
      "show_customer_name": true,
      "show_vehicle_info": true,
      "show_service_details": true,
      "show_photos": true
    },
    "footer": {
      "show_qr": true,
      "show_ledra_badge": true,
      "warranty_text": "",
      "notice_text": ""
    },
    "style": {
      "font_family": "noto-sans-jp",
      "border_style": "simple",
      "background_variant": "white"
    }
  }'::jsonb,
  40
)
ON CONFLICT DO NOTHING;
