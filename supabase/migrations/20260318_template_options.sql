-- ============================================================
-- Template Options: 既製テンプレート利用 + 制作代行
-- ============================================================

-- 1. プラットフォーム既製テンプレート
CREATE TABLE IF NOT EXISTS platform_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  thumbnail_path   TEXT,
  category         TEXT NOT NULL DEFAULT 'coating'
                   CHECK (category IN ('coating', 'detailing', 'maintenance', 'general')),
  base_config      JSONB NOT NULL DEFAULT '{}',
  layout_key       TEXT NOT NULL DEFAULT 'standard',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. テナント別テンプレート設定（カスタマイズ結果）
CREATE TABLE IF NOT EXISTS tenant_template_configs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_template_id UUID REFERENCES platform_templates(id),
  option_type          TEXT NOT NULL CHECK (option_type IN ('preset', 'custom')),
  name                 TEXT NOT NULL,
  config_json          JSONB NOT NULL DEFAULT '{}',
  layout_key           TEXT NOT NULL DEFAULT 'standard',
  is_active            BOOLEAN NOT NULL DEFAULT false,
  is_default           BOOLEAN NOT NULL DEFAULT false,
  published_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ttc_tenant ON tenant_template_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ttc_active ON tenant_template_configs(tenant_id, is_active);

-- 3. テンプレート制作オーダー
CREATE TABLE IF NOT EXISTS template_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_type              TEXT NOT NULL
                          CHECK (order_type IN ('preset_setup', 'custom_production', 'modification', 'additional')),
  status                  TEXT NOT NULL DEFAULT 'pending_payment'
                          CHECK (status IN (
                            'pending_payment', 'paid', 'hearing', 'in_production',
                            'review', 'revision', 'test_issued', 'approved',
                            'active', 'suspended', 'cancelled'
                          )),
  template_config_id      UUID REFERENCES tenant_template_configs(id),
  hearing_json            JSONB,
  assets_json             JSONB,
  notes                   TEXT,
  assigned_to             TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id       TEXT,
  amount                  INT NOT NULL DEFAULT 0,
  revision_count          INT NOT NULL DEFAULT 0,
  max_revisions           INT NOT NULL DEFAULT 1,
  due_date                DATE,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_to_tenant ON template_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_to_status ON template_orders(status);

-- 4. オーダー対応履歴
CREATE TABLE IF NOT EXISTS template_order_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES template_orders(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor         TEXT,
  message       TEXT,
  meta_json     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tol_order ON template_order_logs(order_id);

-- 5. テンプレートアセット
CREATE TABLE IF NOT EXISTS template_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_config_id UUID REFERENCES tenant_template_configs(id),
  asset_type         TEXT NOT NULL CHECK (asset_type IN ('logo', 'brand_guide', 'reference', 'seal', 'other')),
  storage_path       TEXT NOT NULL,
  file_name          TEXT NOT NULL,
  content_type       TEXT,
  file_size          INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ta_tenant ON template_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ta_config ON template_assets(template_config_id);

-- 6. オプションサブスクリプション
CREATE TABLE IF NOT EXISTS tenant_option_subscriptions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  option_type                 TEXT NOT NULL CHECK (option_type IN ('preset', 'custom')),
  status                      TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'past_due', 'cancelled', 'suspended')),
  stripe_subscription_id      TEXT,
  stripe_subscription_item_id TEXT,
  template_config_id          UUID REFERENCES tenant_template_configs(id),
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at                TIMESTAMPTZ,
  current_period_end          TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, option_type)
);
CREATE INDEX IF NOT EXISTS idx_tos_tenant ON tenant_option_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tos_status ON tenant_option_subscriptions(status);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE platform_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_option_subscriptions ENABLE ROW LEVEL SECURITY;

-- platform_templates: 有効なものは全員閲覧可
CREATE POLICY "platform_templates_select" ON platform_templates
  FOR SELECT USING (is_active = true);

-- tenant_template_configs: 自テナントのみ
CREATE POLICY "ttc_select" ON tenant_template_configs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ttc_insert" ON tenant_template_configs
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ttc_update" ON tenant_template_configs
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()));

-- template_orders: 自テナントのみ
CREATE POLICY "to_select" ON template_orders
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "to_insert" ON template_orders
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- template_order_logs: オーダー経由
CREATE POLICY "tol_select" ON template_order_logs
  FOR SELECT USING (
    order_id IN (SELECT id FROM template_orders WHERE tenant_id IN (SELECT my_tenant_ids()))
  );

-- template_assets: 自テナントのみ
CREATE POLICY "ta_select" ON template_assets
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ta_insert" ON template_assets
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- tenant_option_subscriptions: 自テナントのみ
CREATE POLICY "tos_select" ON tenant_option_subscriptions
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));

-- ============================================================
-- 既製テンプレート初期データ（3種類）
-- ============================================================
INSERT INTO platform_templates (name, description, category, layout_key, base_config, sort_order)
VALUES
  (
    'プレミアムブラック',
    '高級感のあるブラック基調のデザイン。コーティング専門店におすすめ。',
    'coating',
    'standard',
    '{
      "version": 1,
      "branding": { "company_name": "" },
      "header": { "title": "施工証明書", "show_issue_date": true, "show_certificate_no": true },
      "body": { "show_customer_name": true, "show_vehicle_info": true, "show_service_details": true, "show_photos": true },
      "footer": { "show_qr": true, "show_cartrust_badge": true, "maintenance_label": "メンテナンス情報" },
      "style": { "font_family": "noto-sans-jp", "border_style": "elegant", "background_variant": "white" }
    }'::jsonb,
    1
  ),
  (
    'クリーンホワイト',
    'シンプルで清潔感のあるホワイト基調。幅広い業種に対応。',
    'general',
    'standard',
    '{
      "version": 1,
      "branding": { "company_name": "" },
      "header": { "title": "施工証明書", "show_issue_date": true, "show_certificate_no": true },
      "body": { "show_customer_name": true, "show_vehicle_info": true, "show_service_details": true, "show_photos": true },
      "footer": { "show_qr": true, "show_cartrust_badge": true, "maintenance_label": "メンテナンス情報" },
      "style": { "font_family": "noto-sans-jp", "border_style": "simple", "background_variant": "white" }
    }'::jsonb,
    2
  ),
  (
    'クラフトナチュラル',
    'ナチュラルで温かみのあるデザイン。ディテーリング・メンテナンス店向け。',
    'detailing',
    'standard',
    '{
      "version": 1,
      "branding": { "company_name": "" },
      "header": { "title": "施工証明書", "show_issue_date": true, "show_certificate_no": true },
      "body": { "show_customer_name": true, "show_vehicle_info": true, "show_service_details": true, "show_photos": true },
      "footer": { "show_qr": true, "show_cartrust_badge": true, "maintenance_label": "メンテナンス情報" },
      "style": { "font_family": "noto-serif-jp", "border_style": "double", "background_variant": "cream" }
    }'::jsonb,
    3
  );
