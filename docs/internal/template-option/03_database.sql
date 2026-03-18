-- ============================================================
-- CARTRUST テンプレートオプション DBテーブル定義
-- ============================================================
-- 前提: Supabase (PostgreSQL) + RLS
-- 既存テーブル: tenants, tenant_memberships, certificates, templates
-- 既存ヘルパー: my_tenant_ids() — 現在ユーザーの所属テナントID配列を返す
-- ============================================================

-- ------------------------------------------------------------
-- 1. platform_templates — 既製テンプレート（プラットフォーム提供）
-- ------------------------------------------------------------
-- CARTRUST運営が登録・管理する既製テンプレートのマスタ。
-- 加盟店はこのテーブルから選択し、自テナント用にカスタムする。
-- 将来テンプレートが追加されても、このテーブルにINSERTするだけで済む。

CREATE TABLE IF NOT EXISTS platform_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,                         -- 表示名「プレミアムブラック」等
  description      TEXT,                                  -- 説明文（ギャラリー表示用）
  thumbnail_path   TEXT,                                  -- サムネイル画像のStorageパス
  category         TEXT NOT NULL DEFAULT 'coating'        -- coating | detailing | maintenance | general
                   CHECK (category IN ('coating', 'detailing', 'maintenance', 'general')),
  base_config      JSONB NOT NULL DEFAULT '{}',           -- デフォルトのconfig_json値
  layout_key       TEXT NOT NULL DEFAULT 'standard',      -- レイアウト識別子（PDF生成時に参照）
  tags             TEXT[] DEFAULT '{}',                    -- 検索・フィルター用タグ
  is_active        BOOLEAN NOT NULL DEFAULT true,         -- 有効/無効（無効=ギャラリー非表示）
  sort_order       INT NOT NULL DEFAULT 0,                -- 表示順
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_templates IS '既製テンプレートマスタ。CARTRUST運営が登録・管理。加盟店はここから選択してカスタムする。';
COMMENT ON COLUMN platform_templates.base_config IS 'デフォルトのconfig_json。テナントが設定を上書きする際のベースになる。';
COMMENT ON COLUMN platform_templates.layout_key IS 'PDFレイアウトの識別子。renderBrandedCertificate で分岐に使う。';

CREATE INDEX idx_pt_category ON platform_templates(category);
CREATE INDEX idx_pt_active_sort ON platform_templates(is_active, sort_order);


-- ------------------------------------------------------------
-- 2. tenant_template_configs — テナント別テンプレート設定
-- ------------------------------------------------------------
-- 各テナントがカスタマイズした結果を保存するテーブル。
-- A（既製テンプレ）: platform_template_id を参照 + config_json で上書き
-- B（制作代行）  : platform_template_id = NULL + config_json に完全な設定
-- config_json のスキーマは 04_config-schema.json を参照。

CREATE TABLE IF NOT EXISTS tenant_template_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_template_id  UUID REFERENCES platform_templates(id) ON DELETE SET NULL,
                        -- A: 既製テンプレへの参照。B: NULLでカスタム制作。
  option_type           TEXT NOT NULL
                        CHECK (option_type IN ('preset', 'custom')),
                        -- preset = A（既製テンプレ利用）, custom = B（制作代行）
  name                  TEXT NOT NULL,                     -- テナント側の表示名
  config_json           JSONB NOT NULL DEFAULT '{}',       -- カスタム設定（config_jsonスキーマ準拠）
  layout_key            TEXT NOT NULL DEFAULT 'standard',  -- レイアウト識別子
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
                        -- draft: 設定中, active: 公開中, suspended: 停止, archived: 解約後保管
  is_default            BOOLEAN NOT NULL DEFAULT false,    -- このテナントのデフォルトテンプレか
  published_at          TIMESTAMPTZ,                       -- 初回公開日時
  version               INT NOT NULL DEFAULT 1,            -- 設定バージョン（更新ごとにインクリメント）
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_template_configs IS 'テナント別のテンプレート設定。config_jsonに全カスタム内容を保持。';
COMMENT ON COLUMN tenant_template_configs.option_type IS 'preset=A(既製テンプレ利用), custom=B(制作代行)';
COMMENT ON COLUMN tenant_template_configs.config_json IS '構造化カスタム設定。04_config-schema.json で定義されたスキーマに準拠。';

CREATE INDEX idx_ttc_tenant ON tenant_template_configs(tenant_id);
CREATE INDEX idx_ttc_tenant_default ON tenant_template_configs(tenant_id, is_default) WHERE is_default = true;
CREATE INDEX idx_ttc_status ON tenant_template_configs(status);

-- テナントごとにis_default=trueは最大1件
CREATE UNIQUE INDEX uniq_ttc_tenant_default ON tenant_template_configs(tenant_id) WHERE is_default = true;


-- ------------------------------------------------------------
-- 3. template_orders — テンプレート制作オーダー
-- ------------------------------------------------------------
-- A申込（セットアップ）、B申込（制作代行）、追加修正作業の全てを管理。
-- ステータス: pending_payment → paid → hearing → in_production → review
--           → revision → test_issued → approved → active
-- 追加作業: modification, additional タイプ

CREATE TABLE IF NOT EXISTS template_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_config_id     UUID REFERENCES tenant_template_configs(id) ON DELETE SET NULL,
                         -- 対象テンプレート設定。制作中に作成→紐づけ。
  order_type             TEXT NOT NULL
                         CHECK (order_type IN (
                           'preset_setup',       -- A: 既製テンプレセットアップ
                           'custom_production',  -- B: オリジナル制作代行
                           'modification',       -- 追加修正作業
                           'additional_template', -- 追加テンプレ制作
                           'redesign'            -- 大幅再設計
                         )),
  order_number           TEXT NOT NULL,            -- 表示用オーダー番号 TPL-YYYYMMDD-NNN
  status                 TEXT NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN (
                           'pending_payment',     -- 決済待ち
                           'paid',                -- 決済完了・着手待ち
                           'hearing',             -- ヒアリング中（B/追加作業）
                           'in_production',       -- 制作中
                           'review',              -- 加盟店レビュー中
                           'revision',            -- 修正中
                           'test_issued',         -- テスト発行済・確認待ち
                           'approved',            -- 承認済・公開準備
                           'active',              -- 完了（公開済）
                           'cancelled'            -- キャンセル
                         )),
  -- ヒアリング・素材
  hearing_json           JSONB,                    -- ヒアリング回答（構造化）
  assets_summary         JSONB,                    -- 提出素材のサマリ [{name, path, type, size}]
  -- 料金
  amount                 INT NOT NULL DEFAULT 0,   -- 金額（税込・円）
  stripe_payment_intent_id TEXT,                   -- 初期費用のPaymentIntent ID
  stripe_checkout_session_id TEXT,                 -- Checkout Session ID
  stripe_invoice_id      TEXT,                     -- 追加作業のInvoice ID
  -- 修正管理
  revision_count         INT NOT NULL DEFAULT 0,   -- 修正実施回数
  max_revisions          INT NOT NULL DEFAULT 1,   -- 修正上限回数
  -- 担当・納期
  assigned_to            TEXT,                     -- 担当者名/ID
  due_date               DATE,                     -- 納期目安
  -- メモ
  internal_notes         TEXT,                     -- 社内メモ（テナントからは見えない）
  tenant_notes           TEXT,                     -- テナントへの伝達メモ
  -- 完了
  completed_at           TIMESTAMPTZ,              -- 完了日時
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE template_orders IS 'テンプレート制作・修正のオーダー管理。A/B申込・追加作業を一元管理。';

CREATE INDEX idx_to_tenant ON template_orders(tenant_id);
CREATE INDEX idx_to_status ON template_orders(status);
CREATE INDEX idx_to_order_number ON template_orders(order_number);
CREATE INDEX idx_to_type_status ON template_orders(order_type, status);


-- ------------------------------------------------------------
-- 4. template_order_logs — オーダー対応履歴
-- ------------------------------------------------------------
-- ステータス変更・コメント・素材アップロード等の全履歴を記録。
-- 加盟店・管理者双方からの操作を記録。

CREATE TABLE IF NOT EXISTS template_order_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES template_orders(id) ON DELETE CASCADE,
  action         TEXT NOT NULL
                 CHECK (action IN (
                   'status_change',     -- ステータス変更
                   'comment',           -- コメント（テナント or 管理者）
                   'asset_upload',      -- 素材アップロード
                   'revision_request',  -- 修正依頼
                   'payment_received',  -- 入金確認
                   'config_update',     -- config_json更新
                   'preview_generated', -- プレビュー生成
                   'test_issued',       -- テスト発行
                   'published'          -- 公開
                 )),
  from_status    TEXT,                  -- 変更前ステータス（status_changeの場合）
  to_status      TEXT,                  -- 変更後ステータス（status_changeの場合）
  actor_type     TEXT NOT NULL DEFAULT 'system'
                 CHECK (actor_type IN ('tenant_user', 'admin', 'system')),
  actor_id       TEXT,                  -- user_id or admin識別子
  message        TEXT,                  -- コメント本文
  meta_json      JSONB,                -- 追加情報（ファイル名・サイズ等）
  is_visible_to_tenant BOOLEAN NOT NULL DEFAULT true, -- テナントに見せるか
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE template_order_logs IS 'オーダー対応履歴。タイムライン表示・監査証跡に使用。';

CREATE INDEX idx_tol_order ON template_order_logs(order_id);
CREATE INDEX idx_tol_order_created ON template_order_logs(order_id, created_at);


-- ------------------------------------------------------------
-- 5. template_assets — テンプレートアセット（ロゴ・素材）
-- ------------------------------------------------------------
-- テナントが提出したロゴ・ブランドガイド・参考資料等を管理。
-- Supabase Storageのパスを参照。

CREATE TABLE IF NOT EXISTS template_assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_config_id  UUID REFERENCES tenant_template_configs(id) ON DELETE SET NULL,
  order_id            UUID REFERENCES template_orders(id) ON DELETE SET NULL,
  asset_type          TEXT NOT NULL
                      CHECK (asset_type IN ('logo', 'brand_guide', 'reference', 'seal', 'other')),
  storage_path        TEXT NOT NULL,             -- Supabase Storage内のパス
  file_name           TEXT NOT NULL,             -- 元ファイル名
  content_type        TEXT,                      -- MIME type
  file_size           INT,                       -- バイト数
  is_active           BOOLEAN NOT NULL DEFAULT true, -- 最新かどうか（差替時にfalse）
  uploaded_by         UUID,                      -- アップロードしたユーザーID
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE template_assets IS 'テンプレート用アセット（ロゴ・素材）管理。Supabase Storageと連携。';

CREATE INDEX idx_ta_tenant ON template_assets(tenant_id);
CREATE INDEX idx_ta_config ON template_assets(template_config_id);
CREATE INDEX idx_ta_order ON template_assets(order_id);


-- ------------------------------------------------------------
-- 6. tenant_option_subscriptions — オプションサブスクリプション
-- ------------------------------------------------------------
-- テナントごとのA/Bオプション契約状態を管理。
-- Stripeのサブスクリプションと紐づけ。
-- ベースプラン（mini/standard/pro）とは独立した契約。

CREATE TABLE IF NOT EXISTS tenant_option_subscriptions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  option_type                TEXT NOT NULL
                             CHECK (option_type IN ('preset', 'custom')),
                             -- preset = A（ブランド証明書ライト）, custom = B（ブランド証明書プレミアム）
  status                     TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN (
                               'active',         -- 有効
                               'past_due',        -- 支払い遅延
                               'cancelled',       -- 解約済み
                               'suspended',       -- 一時停止（未払い猶予期間後）
                               'trialing'         -- トライアル中（キャンペーン用）
                             )),
  template_config_id         UUID REFERENCES tenant_template_configs(id),
                             -- 紐づくテンプレート設定
  -- Stripe情報
  stripe_subscription_id     TEXT,               -- StripeサブスクリプションID（月額用）
  stripe_subscription_item_id TEXT,              -- StripeサブスクリプションアイテムID
  stripe_customer_id         TEXT,               -- Stripe顧客ID（tenants.stripe_customer_idと同じ場合が多い）
  -- 期間
  started_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start       TIMESTAMPTZ,        -- Stripe連動の現在期間開始
  current_period_end         TIMESTAMPTZ,        -- Stripe連動の現在期間終了
  cancelled_at               TIMESTAMPTZ,        -- 解約日時
  cancel_at_period_end       BOOLEAN DEFAULT false, -- 期間終了時に解約するか
  -- キャンペーン
  campaign_code              TEXT,               -- 適用キャンペーンコード
  discount_amount            INT,                -- 割引額（初期費用に対して）
  -- メタ
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_option_subscriptions IS 'テナントのテンプレートオプション契約。Stripeサブスクと連動。';

-- テナントあたり各タイプ最大1件の有効契約（cancelledは除外）
CREATE UNIQUE INDEX uniq_tos_tenant_type_active ON tenant_option_subscriptions(tenant_id, option_type)
  WHERE status NOT IN ('cancelled');

CREATE INDEX idx_tos_tenant ON tenant_option_subscriptions(tenant_id);
CREATE INDEX idx_tos_status ON tenant_option_subscriptions(status);
CREATE INDEX idx_tos_stripe_sub ON tenant_option_subscriptions(stripe_subscription_id);


-- ------------------------------------------------------------
-- 7. template_test_issues — テスト発行ログ
-- ------------------------------------------------------------
-- テスト発行回数の制限管理用。月ごとにリセット。

CREATE TABLE IF NOT EXISTS template_test_issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_config_id  UUID NOT NULL REFERENCES tenant_template_configs(id) ON DELETE CASCADE,
  issued_by           UUID,                      -- 発行したユーザーID
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 月ごとの集計用
  issue_month         TEXT NOT NULL               -- 'YYYY-MM' 形式。月次制限チェック用。
                      DEFAULT to_char(now(), 'YYYY-MM')
);

COMMENT ON TABLE template_test_issues IS 'テスト発行ログ。月次の発行上限チェックに使用。';

CREATE INDEX idx_tti_tenant_month ON template_test_issues(tenant_id, issue_month);


-- ============================================================
-- RLS ポリシー
-- ============================================================

ALTER TABLE platform_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_option_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_test_issues ENABLE ROW LEVEL SECURITY;

-- platform_templates: 有効なものは全ユーザーが閲覧可（ギャラリー表示のため）
CREATE POLICY "pt_select_active" ON platform_templates
  FOR SELECT USING (is_active = true);

-- tenant_template_configs: 自テナントのみCRUD
CREATE POLICY "ttc_select_own" ON tenant_template_configs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ttc_insert_own" ON tenant_template_configs
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ttc_update_own" ON tenant_template_configs
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()));
-- DELETE は管理者のみ（service_role経由）

-- template_orders: 自テナントの閲覧・作成のみ。更新は管理者（service_role経由）
CREATE POLICY "to_select_own" ON template_orders
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "to_insert_own" ON template_orders
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
-- UPDATE/DELETE は service_role のみ（管理者画面から操作）

-- template_order_logs: オーダー経由で自テナントが閲覧可（visible_to_tenantのもののみ）
CREATE POLICY "tol_select_own" ON template_order_logs
  FOR SELECT USING (
    is_visible_to_tenant = true
    AND order_id IN (
      SELECT id FROM template_orders WHERE tenant_id IN (SELECT my_tenant_ids())
    )
  );
-- INSERT/UPDATE は service_role のみ

-- template_assets: 自テナントのみ
CREATE POLICY "ta_select_own" ON template_assets
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ta_insert_own" ON template_assets
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- tenant_option_subscriptions: 自テナントのみ閲覧
CREATE POLICY "tos_select_own" ON tenant_option_subscriptions
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
-- INSERT/UPDATE は service_role のみ（Stripe Webhook経由）

-- template_test_issues: 自テナントのみ
CREATE POLICY "tti_select_own" ON template_test_issues
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "tti_insert_own" ON template_test_issues
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));


-- ============================================================
-- オーダー番号生成用シーケンス
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS template_order_seq START 1;

-- オーダー番号生成関数
CREATE OR REPLACE FUNCTION generate_template_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TPL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('template_order_seq')::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_template_order_number IS 'テンプレートオーダー番号を生成。TPL-YYYYMMDD-NNN形式。';


-- ============================================================
-- テスト発行回数チェック関数
-- ============================================================
CREATE OR REPLACE FUNCTION check_test_issue_limit(
  p_tenant_id UUID,
  p_option_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INT;
  v_limit INT;
  v_current_month TEXT;
BEGIN
  v_current_month := to_char(now(), 'YYYY-MM');

  -- 月間テスト発行数をカウント
  SELECT COUNT(*) INTO v_count
  FROM template_test_issues
  WHERE tenant_id = p_tenant_id
    AND issue_month = v_current_month;

  -- オプションタイプごとの上限
  IF p_option_type = 'preset' THEN
    v_limit := 3;   -- A契約: 月3回
  ELSIF p_option_type = 'custom' THEN
    v_limit := 5;   -- B契約: 月5回
  ELSE
    v_limit := 0;
  END IF;

  RETURN v_count < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 既存テーブルへの変更
-- ============================================================

-- certificates テーブルに template_config_id を追加
-- 証明書がどのテンプレート設定で発行されたかを記録
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS template_config_id UUID REFERENCES tenant_template_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cert_template_config ON certificates(template_config_id);

COMMENT ON COLUMN certificates.template_config_id IS '発行時に使用したテンプレート設定。NULLの場合はCARTRUST標準テンプレート。';


-- ============================================================
-- Supabase Storage バケット設計
-- ============================================================
-- バケット名: template-assets
-- パス構造: {tenant_id}/{asset_type}/{file_name}
-- 例: abc123-def456/logo/company_logo.png
-- RLS: template_assets テーブルと連動（storage_path で照合）
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('template-assets', 'template-assets', false);
