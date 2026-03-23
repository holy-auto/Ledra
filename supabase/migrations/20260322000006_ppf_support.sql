-- PPF (Paint Protection Film) 施工証明書サポート

-- 0. templates テーブルに category カラム追加
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'coating';

-- 1. certificates テーブルに ppf_coverage_json カラム追加
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS ppf_coverage_json jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN certificates.ppf_coverage_json IS
  'PPF施工範囲 [{panel, coverage, partial_note}]';

-- 2. certificates テーブルに service_type カラム追加（未存在の場合）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'service_type'
  ) THEN
    ALTER TABLE certificates ADD COLUMN service_type text DEFAULT 'coating';
  END IF;
END $$;

-- 3. platform_templates.category の CHECK制約を更新して ppf を追加
ALTER TABLE platform_templates
  DROP CONSTRAINT IF EXISTS platform_templates_category_check;
ALTER TABLE platform_templates
  ADD CONSTRAINT platform_templates_category_check
  CHECK (category IN ('coating', 'detailing', 'maintenance', 'general', 'ppf'));

-- 4. PPF用テンプレート初期データ
INSERT INTO platform_templates (name, description, category, layout_key, base_config, sort_order)
VALUES (
  'PPFスタンダード',
  'ペイントプロテクションフィルム施工証明書の標準テンプレート',
  'ppf',
  'standard',
  '{
    "version": 1,
    "branding": { "company_name": "" },
    "header": {
      "title": "PPF施工証明書",
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
      "show_cartrust_badge": true,
      "warranty_text": "",
      "notice_text": ""
    },
    "style": {
      "font_family": "noto-sans-jp",
      "border_style": "elegant",
      "background_variant": "white"
    }
  }'::jsonb,
  10
)
ON CONFLICT DO NOTHING;
