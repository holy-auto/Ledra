# CARTRUST テンプレートオプション設計 — 完全実装計画

## Context
CARTRUSTは施工証明書を発行・管理するSaaS。加盟店（コーティング・ディテーリング施工店）から「自社ブランド入り証明書」のニーズが高い。
現在のテンプレート機能（`templates`テーブル + `schema_json`）は施工項目の構造定義のみで、見た目・ブランディングの制御機能がない。
本計画では「A. 既製テンプレート利用オプション」「B. オリジナルテンプレート制作代行」の2商品を設計し、ARPU向上・解約率低下・差別化を実現する。

---

# 1. エグゼクティブサマリー

## A/B 2商品構成の妥当性
- **A（既製テンプレート）**: 月商50万円以下の小規模店向け。低価格で導入障壁が低く、テンプレ選択+ロゴ差替+配色変更で「それなりに自社っぽい証明書」が出せる。CARTRUST加盟店の70%がターゲット。
- **B（制作代行）**: 月商100万円以上のディテーリング専門店・高級コーティング店向け。ブランド価値重視で「完全オリジナル風の証明書」が必要な層。加盟店の20%がターゲットだが単価が高い。
- **C（書類パック）を切る理由**: メンテナンスガイドはURL/QR運用で十分。書類を増やすと運用・保守コストが肥大化し、現フェーズではROIが合わない。

## 事業インパクト
- ARPU: A契約で+¥3,300/月、B契約で+¥4,400/月。加盟店100社でA:70社/B:20社の場合、MRR +¥319,000
- 初期費用: A:70×¥16,500 + B:20×¥88,000 = ¥2,915,000（一括キャッシュ）
- LTV向上: テンプレートカスタムは「自社仕様」感を生み、スイッチングコストを上げる→解約率低下
- 差別化: 競合SaaSに「施工証明書のブランドカスタム」を提供するサービスはほぼない

## 推奨価格（たたき台評価済み）
| 項目 | A. 既製テンプレート | B. 制作代行 |
|---|---|---|
| 初期費用 | ¥16,500（妥当） | ¥88,000（妥当。値上げ余地あり→¥110,000まで） |
| 月額 | ¥3,300（妥当） | ¥4,400（妥当。¥5,500でも可） |

**価格評価**: Aの初期¥16,500はロゴ差替+配色設定の工数を考えると妥当。Bの初期¥88,000はデザイン制作代行の相場（¥100,000〜¥300,000）と比較して安め＝導入障壁を下げる戦略として正しい。月額はA/Bともに「ホスティング+保守+更新権」の対価として妥当。

---

# 2. 商品設計詳細

## A. 既製テンプレート利用オプション

### 商品名候補
1. **「ブランド証明書 ライト」**（推奨）
2. 「テンプレートカスタム」
3. 「マイ証明書プラン」

### ターゲット
- 月商30〜80万円の小〜中規模コーティング店
- 「ロゴが入るだけで十分」な店舗
- ITリテラシーが低めでも自分で設定したい店

### 提供内容
- 既製テンプレート（5〜10種類）からの選択
- ロゴ画像の差し替え（1点）
- 社名・店舗情報の反映
- ブランドカラー（プライマリ・セカンダリ）の変更
- 保証文言の軽微な調整（200文字以内のフッターテキスト）
- メンテナンスURL（1件）の設定
- QRコード表示ON/OFF
- テスト発行（3回まで）
- プレビュー機能

### 含まない内容
- レイアウトの変更
- 項目構成の変更
- フォント変更
- 複数テンプレートの同時利用（追加料金）
- 修正回数無制限の対応
- 法務レビュー・弁護士確認

### 修正回数
- 初期設定時：CARTRUST側のセルフサービス（加盟店が管理画面から設定）
- 設定後の変更：管理画面からいつでも可能（ロゴ・配色・文言）
- レイアウト変更要望→B or 追加作業費へ誘導

### 納品フロー
1. 申込（管理画面 or 営業経由）
2. Stripe決済（初期費用+月額開始）
3. 管理画面でテンプレ選択・設定
4. プレビュー確認
5. テスト発行（最大3回）
6. 公開（即時利用開始）
- **納期目安**: 即日〜1営業日（セルフサービス）

### 申込条件
- CARTRUSTの有効なサブスクリプション（mini以上）
- クレジットカード決済

### 利用制限
- テンプレート数: 1つ（追加は¥11,000/月）
- ロゴサイズ: 最大2MB、PNG/SVG/JPG
- テスト発行: 月3回まで

---

## B. オリジナルテンプレート制作代行

### 商品名候補
1. **「ブランド証明書 プレミアム」**（推奨）
2. 「オリジナル証明書制作」
3. 「カスタム証明書プラン」

### ターゲット
- 月商100万円以上の高級コーティング・ディテーリング専門店
- ブランドイメージにこだわりがある店舗
- 保証文言・注意文言を自社仕様にしたい店
- 顧客への「見せ方」を重視する店

### 提供内容
- 専任担当によるヒアリング（1回）
- ロゴ・ブランドカラーの反映
- 社名・店舗情報の反映
- 保証文言・注意文言のカスタム
- 項目構成の調整（CARTRUST構造維持の範囲）
- レイアウト調整（ヘッダー・本文・フッターの配置変更）
- メンテナンスURL組み込み
- QRコード組み込み
- テスト発行（5回まで）
- 初回修正対応（1回、公開後2週間以内）

### 含まない内容
- CARTRUST証明書構造を逸脱するレイアウト
- 動的処理の追加（計算式・条件分岐等）
- 法務レビュー・弁護士確認
- 多言語対応
- 2回目以降の修正（追加作業費）
- 複数テンプレートの同時制作（追加料金）

### 修正回数
- 制作中：初回レビュー後1回の修正を含む
- 公開後：2週間以内に1回の軽微修正を含む
- それ以降：追加作業費（¥5,500〜）

### 納品フロー
1. 申込（管理画面 or 営業経由）
2. Stripe決済（初期費用）
3. ヒアリングシート記入（加盟店）
4. 素材提出（ロゴ・ブランドガイド等）
5. 初稿制作（CARTRUST側：5営業日）
6. レビュー・FB（加盟店：3営業日）
7. 修正反映（CARTRUST側：3営業日）
8. テスト発行確認（加盟店）
9. 承認・公開
10. 月額課金開始
- **納期目安**: 申込から公開まで2〜3週間

### 申込条件
- CARTRUSTの有効なサブスクリプション（standard以上推奨）
- クレジットカード決済
- ヒアリングシートの記入完了
- ロゴデータの提出

---

# 3. 料金設計詳細

## 価格体系

| 項目 | 金額（税込） | 役割 |
|---|---|---|
| **A 初期費用** | ¥16,500 | テンプレ設定・初期サポート費 |
| **A 月額** | ¥3,300 | テンプレ利用・保守・更新権 |
| **B 初期費用** | ¥88,000 | デザイン制作・ヒアリング・修正1回分 |
| **B 月額** | ¥4,400 | テンプレ利用・保守・更新権 |
| 文言修正 | ¥5,500〜 | 保証文言・注意文言の変更 |
| レイアウト調整 | ¥11,000〜 | 配置・構成の変更 |
| QR/URL差し替え | ¥3,300〜 | メンテナンスURL・QR変更 |
| テンプレート追加制作 | ¥33,000〜¥55,000 | 2つ目以降のテンプレート |
| 大幅再設計 | 別見積 | フルリニューアル |

## 初期費用と月額の役割分離
- **初期費用**: 制作工数の回収。赤字にならないための損益分岐点。
- **月額**: 継続利用料。ホスティング・保守・将来のテンプレートエンジン改善の原資。
- この分離により「作り逃げ」を防ぎ、継続課金でLTVを確保する。

## キャンペーン設計（先着100社）
- **A**: 初期費用 ¥16,500 → ¥0（月額は据置）
- **B**: 初期費用 ¥88,000 → ¥55,000（37.5%OFF）
- 条件: 本契約開始から6ヶ月以内の解約は初期費用の全額請求
- Stripe実装: クーポンコード `TEMPLATE_LAUNCH_100` で初期費用をディスカウント

## 料金ページの見せ方
- A/Bを横並びで比較表形式
- 「まずはライトで始めて、こだわりが出たらプレミアムへ」のアップグレード導線
- 追加作業費は別セクションで小さく表示

---

# 4. 提供範囲・責任分界

## CARTRUST側の責任
- テンプレートの技術的な正常動作
- PDF出力の品質保証
- QRコードの正常動作
- データの保全

## 加盟店側の責任
- ロゴデータの権利確認
- 保証文言・注意文言の内容の正確性
- 法務的な文言の妥当性確認
- 素材の提出期限遵守

## 明確な除外事項
- 「弁護士レビューは含みません。保証文言・注意文言の法的妥当性は加盟店様の責任となります。」
- 「ロゴ・画像素材の著作権は加盟店様にて確認ください。」
- 「CARTRUSTの証明書構造（必須項目）を削除・非表示にすることはできません。」

---

# 5. 運用フロー

## A. 既製テンプレートの運用フロー
```
申込 → 決済 → テンプレ選択 → 設定入力 → プレビュー → テスト発行 → 公開
                 (セルフサービス・管理画面から即時)
```

## B. 制作代行の運用フロー
```
申込 → 決済(初期) → ヒアリングシート → 素材提出 → 初稿制作(5営業日)
→ レビュー(3営業日) → 修正(3営業日) → テスト発行 → 承認 → 公開 → 月額開始
```

## ヒアリング項目（B用）
1. 店舗名・正式名称
2. ロゴデータ（AI/PNG/SVG）
3. ブランドカラー（HEXコード or 参考URL）
4. 保証文言（希望テキスト）
5. 注意文言（希望テキスト）
6. メンテナンスURL
7. 参考にしたいデザイン（あれば）
8. 証明書に載せたい項目一覧
9. 発行頻度の目安

## 加盟店提出素材
- ロゴ（必須）: PNG/SVG/AI、300dpi以上推奨
- ブランドガイド（あれば）
- 保証文言テキスト（あれば）
- 参考デザイン（あれば）

## ステータス管理
| ステータス | 意味 |
|---|---|
| `pending_payment` | 決済待ち |
| `paid` | 決済完了・着手待ち |
| `hearing` | ヒアリング中 |
| `in_production` | 制作中 |
| `review` | 加盟店レビュー中 |
| `revision` | 修正中 |
| `test_issued` | テスト発行済・確認待ち |
| `approved` | 承認済・公開準備 |
| `active` | 公開中 |
| `suspended` | 一時停止（未払い等） |
| `cancelled` | キャンセル |

---

# 6. 管理画面設計

## 画面一覧・URLパス

### 加盟店側（テナント）

| 画面 | URLパス | 説明 |
|---|---|---|
| テンプレートオプション TOP | `/admin/template-options` | オプション契約状況・テンプレ一覧 |
| テンプレートギャラリー | `/admin/template-options/gallery` | 既製テンプレート一覧（A申込導線） |
| テンプレート設定 | `/admin/template-options/configure/[id]` | ロゴ・配色・文言設定 |
| テンプレートプレビュー | `/admin/template-options/preview/[id]` | PDF/HTMLプレビュー |
| 制作代行申込 | `/admin/template-options/order` | B申込フォーム |
| 制作代行ステータス | `/admin/template-options/order/[orderId]` | 制作進捗確認 |
| メンテナンスURL設定 | `/admin/template-options/maintenance-url` | URL/QR設定 |

### 管理者側（CARTRUST運営）

| 画面 | URLパス | 説明 |
|---|---|---|
| テンプレート管理 | `/admin/platform/templates` | 既製テンプレート登録・編集 |
| オーダー管理 | `/admin/platform/template-orders` | 全テナントの制作依頼一覧 |
| オーダー詳細 | `/admin/platform/template-orders/[id]` | 個別オーダーの進捗・対応 |
| オプション契約一覧 | `/admin/platform/template-subscriptions` | テナント別契約状況 |

## コンポーネント分割案

```
src/
├── app/admin/template-options/
│   ├── page.tsx                          # TOP（契約状況+テンプレ一覧）
│   ├── gallery/page.tsx                  # ギャラリー
│   ├── configure/[id]/page.tsx           # 設定画面
│   ├── preview/[id]/page.tsx             # プレビュー
│   ├── order/page.tsx                    # B申込フォーム
│   ├── order/[orderId]/page.tsx          # 制作進捗
│   └── maintenance-url/page.tsx          # URL/QR設定
├── app/admin/platform/
│   ├── templates/page.tsx                # 既製テンプレ管理
│   ├── template-orders/page.tsx          # オーダー管理
│   ├── template-orders/[id]/page.tsx     # オーダー詳細
│   └── template-subscriptions/page.tsx   # 契約一覧
├── components/template-options/
│   ├── TemplateGalleryCard.tsx            # ギャラリーのカード
│   ├── TemplateConfigForm.tsx             # 設定フォーム
│   ├── TemplatePreview.tsx                # プレビューコンポーネント
│   ├── OrderStatusBadge.tsx               # ステータスバッジ
│   ├── OrderTimeline.tsx                  # 制作進捗タイムライン
│   ├── MaintenanceUrlForm.tsx             # URL設定フォーム
│   ├── BrandColorPicker.tsx               # カラーピッカー
│   └── SubscriptionStatusCard.tsx         # 契約状態カード
├── app/api/template-options/
│   ├── subscribe/route.ts                 # A/B申込・Stripe決済
│   ├── configure/route.ts                 # テンプレ設定保存
│   ├── preview/route.ts                   # プレビューPDF生成
│   ├── orders/route.ts                    # 制作依頼CRUD
│   ├── orders/[id]/status/route.ts        # ステータス更新
│   └── maintenance-url/route.ts           # URL設定
├── lib/template-options/
│   ├── configSchema.ts                    # config_json のZodスキーマ
│   ├── renderBrandedCertificate.tsx        # ブランド証明書PDF
│   ├── templateOptionFeatures.ts          # オプション機能制御
│   └── stripe.ts                          # オプション用Stripe処理
└── types/
    └── templateOption.ts                  # 型定義
```

---

# 7. DB / データ構造設計

## Supabase マイグレーションSQL

```sql
-- テンプレートオプション用テーブル群

-- 1. 既製テンプレート（プラットフォーム提供）
CREATE TABLE IF NOT EXISTS platform_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,                    -- 「プレミアムブラック」等
  description  TEXT,                             -- 説明文
  thumbnail_path TEXT,                           -- サムネイル画像パス
  category     TEXT NOT NULL DEFAULT 'coating',  -- coating / detailing / maintenance / general
  base_config  JSONB NOT NULL DEFAULT '{}',      -- デフォルト設定値
  layout_key   TEXT NOT NULL DEFAULT 'standard', -- レイアウト識別子
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. テナント別テンプレート設定（カスタマイズ結果）
CREATE TABLE IF NOT EXISTS tenant_template_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_template_id UUID REFERENCES platform_templates(id),  -- NULLの場合はB(制作代行)
  option_type       TEXT NOT NULL CHECK (option_type IN ('preset', 'custom')),  -- A=preset, B=custom
  name              TEXT NOT NULL,                -- テナント側の表示名
  config_json       JSONB NOT NULL DEFAULT '{}',  -- カスタム設定（後述のスキーマ）
  layout_key        TEXT NOT NULL DEFAULT 'standard',
  is_active         BOOLEAN NOT NULL DEFAULT false,  -- 公開中かどうか
  is_default        BOOLEAN NOT NULL DEFAULT false,  -- このテナントのデフォルトテンプレか
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ttc_tenant ON tenant_template_configs(tenant_id);

-- 3. テンプレート制作オーダー
CREATE TABLE IF NOT EXISTS template_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_type      TEXT NOT NULL CHECK (order_type IN ('preset_setup', 'custom_production', 'modification', 'additional')),
  status          TEXT NOT NULL DEFAULT 'pending_payment'
                  CHECK (status IN (
                    'pending_payment', 'paid', 'hearing', 'in_production',
                    'review', 'revision', 'test_issued', 'approved',
                    'active', 'suspended', 'cancelled'
                  )),
  template_config_id UUID REFERENCES tenant_template_configs(id),
  hearing_json    JSONB,                          -- ヒアリング回答
  assets_json     JSONB,                          -- 提出素材情報
  notes           TEXT,                           -- 社内メモ
  assigned_to     TEXT,                           -- 担当者名
  stripe_payment_intent_id TEXT,                  -- 初期費用のPaymentIntent
  stripe_invoice_id TEXT,                         -- 追加作業のInvoice
  amount          INT NOT NULL DEFAULT 0,         -- 金額（税込・円）
  revision_count  INT NOT NULL DEFAULT 0,         -- 修正回数
  max_revisions   INT NOT NULL DEFAULT 1,         -- 修正上限
  due_date        DATE,                           -- 納期目安
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_to_tenant ON template_orders(tenant_id);
CREATE INDEX idx_to_status ON template_orders(status);

-- 4. オーダー対応履歴
CREATE TABLE IF NOT EXISTS template_order_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES template_orders(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,       -- status_change, comment, asset_upload, revision_request
  from_status   TEXT,
  to_status     TEXT,
  actor         TEXT,                -- user_id or 'system' or 'admin:xxx'
  message       TEXT,
  meta_json     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tol_order ON template_order_logs(order_id);

-- 5. テンプレートアセット（ロゴ・素材）
CREATE TABLE IF NOT EXISTS template_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_config_id UUID REFERENCES tenant_template_configs(id),
  asset_type      TEXT NOT NULL CHECK (asset_type IN ('logo', 'brand_guide', 'reference', 'seal', 'other')),
  storage_path    TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  content_type    TEXT,
  file_size       INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ta_tenant ON template_assets(tenant_id);

-- 6. オプションサブスクリプション
CREATE TABLE IF NOT EXISTS tenant_option_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  option_type           TEXT NOT NULL CHECK (option_type IN ('preset', 'custom')),
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'past_due', 'cancelled', 'suspended')),
  stripe_subscription_id TEXT,          -- オプション用Stripeサブスク
  stripe_subscription_item_id TEXT,
  template_config_id    UUID REFERENCES tenant_template_configs(id),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at          TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, option_type)        -- テナントあたり各タイプ1契約
);
CREATE INDEX idx_tos_tenant ON tenant_option_subscriptions(tenant_id);

-- RLS
ALTER TABLE platform_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_option_subscriptions ENABLE ROW LEVEL SECURITY;

-- platform_templates: 全員読み取り可
CREATE POLICY "platform_templates_read" ON platform_templates
  FOR SELECT USING (is_active = true);

-- tenant_template_configs: 自テナントのみ
CREATE POLICY "ttc_tenant_read" ON tenant_template_configs
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ttc_tenant_insert" ON tenant_template_configs
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ttc_tenant_update" ON tenant_template_configs
  FOR UPDATE USING (tenant_id IN (SELECT my_tenant_ids()));

-- template_orders: 自テナントのみ
CREATE POLICY "to_tenant_read" ON template_orders
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "to_tenant_insert" ON template_orders
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- template_order_logs: オーダー経由で自テナントのみ
CREATE POLICY "tol_tenant_read" ON template_order_logs
  FOR SELECT USING (
    order_id IN (SELECT id FROM template_orders WHERE tenant_id IN (SELECT my_tenant_ids()))
  );

-- template_assets: 自テナントのみ
CREATE POLICY "ta_tenant_read" ON template_assets
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
CREATE POLICY "ta_tenant_insert" ON template_assets
  FOR INSERT WITH CHECK (tenant_id IN (SELECT my_tenant_ids()));

-- tenant_option_subscriptions: 自テナントのみ
CREATE POLICY "tos_tenant_read" ON tenant_option_subscriptions
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
```

## config_json スキーマ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": { "type": "integer", "const": 1 },
    "branding": {
      "type": "object",
      "properties": {
        "logo_asset_id": { "type": "string", "format": "uuid" },
        "logo_position": { "type": "string", "enum": ["top-left", "top-center", "top-right"] },
        "logo_max_height": { "type": "integer", "minimum": 20, "maximum": 80, "default": 40 },
        "primary_color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "secondary_color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "accent_color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "company_name": { "type": "string", "maxLength": 100 },
        "company_address": { "type": "string", "maxLength": 200 },
        "company_phone": { "type": "string", "maxLength": 20 },
        "company_url": { "type": "string", "format": "uri", "maxLength": 200 }
      },
      "required": ["company_name"]
    },
    "header": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "default": "施工証明書", "maxLength": 30 },
        "subtitle": { "type": "string", "maxLength": 50 },
        "show_issue_date": { "type": "boolean", "default": true },
        "show_certificate_no": { "type": "boolean", "default": true }
      }
    },
    "body": {
      "type": "object",
      "properties": {
        "show_customer_name": { "type": "boolean", "default": true, "readOnly": true },
        "show_vehicle_info": { "type": "boolean", "default": true, "readOnly": true },
        "show_service_details": { "type": "boolean", "default": true, "readOnly": true },
        "show_photos": { "type": "boolean", "default": true },
        "custom_sections": {
          "type": "array",
          "maxItems": 3,
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string", "maxLength": 30 },
              "content": { "type": "string", "maxLength": 500 }
            }
          }
        }
      }
    },
    "footer": {
      "type": "object",
      "properties": {
        "warranty_text": { "type": "string", "maxLength": 500 },
        "notice_text": { "type": "string", "maxLength": 500 },
        "show_qr": { "type": "boolean", "default": true },
        "show_cartrust_badge": { "type": "boolean", "default": true, "readOnly": true },
        "maintenance_url": { "type": "string", "format": "uri", "maxLength": 500 },
        "maintenance_label": { "type": "string", "maxLength": 50, "default": "メンテナンス情報" },
        "show_maintenance_qr": { "type": "boolean", "default": false }
      }
    },
    "style": {
      "type": "object",
      "properties": {
        "font_family": { "type": "string", "enum": ["noto-sans-jp", "noto-serif-jp"], "default": "noto-sans-jp" },
        "border_style": { "type": "string", "enum": ["none", "simple", "double", "elegant"], "default": "simple" },
        "background_variant": { "type": "string", "enum": ["white", "cream", "light-gray"], "default": "white" }
      }
    }
  },
  "required": ["version", "branding"]
}
```

### 構造化カスタムの原則
- `readOnly: true` の項目: 顧客名・車両情報・施工内容・CARTRUSTバッジは必ず表示（証明書の信頼性担保）
- A契約: `branding`（ロゴ・配色・社名）+ `footer`（文言・URL）+ `style`（配色のみ）を変更可能
- B契約: 上記に加え `header`（タイトル変更）+ `body`（カスタムセクション追加）+ `style`（フォント・ボーダー変更）が可能
- 管理者のみ: `layout_key` の変更、`readOnly` 項目のオーバーライド

---

# 8. 権限制御 / プラン制限

| 機能 | 未契約 | A契約 | B契約 | 管理者 |
|---|---|---|---|---|
| 既製テンプレ閲覧 | ○（ギャラリーのみ） | ○ | ○ | ○ |
| ロゴ・配色設定 | × | ○ | ○ | ○ |
| 文言調整 | × | ○（200字） | ○（500字） | ○ |
| レイアウト変更 | × | × | ×（制作依頼） | ○ |
| カスタムセクション追加 | × | × | ○（3つまで） | ○ |
| テスト発行 | × | 月3回 | 月5回 | 無制限 |
| テンプレート数上限 | 0 | 1 | 1 | 無制限 |
| メンテナンスURL | × | 1件 | 3件 | 無制限 |
| プレビュー | × | ○ | ○ | ○ |

### 契約解除時
- 月額停止後、grace period（7日）経過で `suspended` に移行
- `suspended` 状態：証明書発行時にデフォルトテンプレート（CARTRUST標準）にフォールバック
- カスタムテンプレートのデータは削除しない（再契約時に復元可能）

### 月額未払い時
- Stripeの `past_due` → 3回リトライ後 `cancelled`
- `cancelled` 後30日間はデータ保持、以降はアーカイブ

---

# 9. Stripe 商品/価格ID 設計方針

## Stripe Products
```
Product: "ブランド証明書 ライト"
  - Price (one_time): STRIPE_PRICE_TEMPLATE_PRESET_SETUP = ¥16,500
  - Price (recurring/monthly): STRIPE_PRICE_TEMPLATE_PRESET_MONTHLY = ¥3,300

Product: "ブランド証明書 プレミアム"
  - Price (one_time): STRIPE_PRICE_TEMPLATE_CUSTOM_SETUP = ¥88,000
  - Price (recurring/monthly): STRIPE_PRICE_TEMPLATE_CUSTOM_MONTHLY = ¥4,400

Product: "テンプレート追加作業"
  - 都度 Invoice で発行（Price不要、line_item で金額指定）
```

## 実装方針
- 初期費用: Stripe Checkout Session の `line_items` に one_time price を含める
- 月額: 同じ Checkout Session に recurring price を含める（Stripeは1セッションで混在可能）
- 追加作業: `stripe.invoices.create()` + `stripe.invoiceItems.create()` で都度請求
- Webhook: `invoice.paid` でオーダーステータスを `paid` に更新
- 環境変数: `.env` に `STRIPE_PRICE_TEMPLATE_PRESET_SETUP`, `STRIPE_PRICE_TEMPLATE_PRESET_MONTHLY`, `STRIPE_PRICE_TEMPLATE_CUSTOM_SETUP`, `STRIPE_PRICE_TEMPLATE_CUSTOM_MONTHLY` を追加

---

# 10. 既存サブスクプランとの組み合わせ表

| ベースプラン | テンプレオプション | 月額合計 | 利用可能機能 |
|---|---|---|---|
| ミニ ¥980 | なし | ¥980 | 基本証明書発行 |
| ミニ ¥980 | A ¥3,300 | ¥4,280 | +ブランド証明書ライト |
| スタンダード ¥2,980 | なし | ¥2,980 | テンプレ管理・CSV・帳票 |
| スタンダード ¥2,980 | A ¥3,300 | ¥6,280 | +ブランド証明書ライト |
| スタンダード ¥2,980 | B ¥4,400 | ¥7,380 | +ブランド証明書プレミアム |
| プロ ¥9,800 | なし | ¥9,800 | 全機能 |
| プロ ¥9,800 | A ¥3,300 | ¥13,100 | +ブランド証明書ライト |
| プロ ¥9,800 | B ¥4,400 | ¥14,200 | +ブランド証明書プレミアム |

**注**: テンプレートオプションはベースプランとは独立したStripeサブスクリプション。ベースプランが `cancelled` になってもオプション契約は独立して存続するが、証明書発行自体ができなくなるため実質的に利用不可。

---

# 11. 文言案

## 料金ページ掲載文言

### A. ブランド証明書 ライト
> 既製テンプレートをベースに、貴社のロゴ・ブランドカラーを反映した施工証明書を発行できます。管理画面からかんたんに設定でき、最短即日でご利用開始いただけます。
> - 既製テンプレートから選択
> - ロゴ・社名の反映
> - ブランドカラーの設定
> - メンテナンスURL/QRコードの組み込み
> - 初期費用 ¥16,500 / 月額 ¥3,300

### B. ブランド証明書 プレミアム
> 専任担当がヒアリングの上、貴社専用の施工証明書テンプレートを制作します。ブランドイメージに合わせた配色・レイアウト・文言で、高級感と信頼感のある証明書を実現します。
> - 専任担当によるヒアリング
> - オリジナルデザイン制作
> - 保証文言・注意文言のカスタム
> - レイアウト調整
> - テスト発行・初回修正込み
> - 初期費用 ¥88,000 / 月額 ¥4,400

### よくある質問
> **Q. 既存のプランと併用できますか？**
> A. はい。現在ご利用中のプラン（ミニ/スタンダード/プロ）に追加する形でご利用いただけます。
>
> **Q. 途中でライトからプレミアムに変更できますか？**
> A. はい。プレミアムへのアップグレードは随時承ります。ライトの初期費用はプレミアム初期費用から差し引きます。
>
> **Q. 解約した場合、テンプレートはどうなりますか？**
> A. 解約後はCARTRUST標準テンプレートに切り替わります。カスタムテンプレートのデータは30日間保持され、再契約時に復元可能です。
>
> **Q. 証明書の必須項目を非表示にできますか？**
> A. いいえ。お客様名・車両情報・施工内容・CARTRUST認証マーク等の必須項目は、証明書としての信頼性を担保するため非表示にできません。

### 注意事項
> - 保証文言・注意文言の法的妥当性は加盟店様にてご確認ください（弁護士レビューは含みません）。
> - ロゴ・画像素材の著作権は加盟店様にてご確認ください。
> - CARTRUSTの証明書構造（必須表示項目）の削除・非表示はできません。
> - 表示価格はすべて税込です。

## 営業トーク例

### A向け
> 「今のCARTRUST証明書に御社のロゴとカラーを入れるだけで、お客様への信頼感がグッと上がります。初期¥16,500、月額¥3,300で、設定は管理画面から即日できます。」

### B向け
> 「高級コーティング店として、証明書もブランドの一部ですよね。プレミアムなら御社専用デザインを制作しますので、お客様に渡す証明書がそのまま"名刺"になります。初期¥88,000で、2〜3週間で公開できます。」

### 価格への反論対応
> 「月額¥3,300は1日あたり約¥110です。証明書1枚あたりのブランド価値向上を考えると、すぐに回収できます。」
> 「初期費用¥88,000は一般的なデザイン制作会社に依頼する半額以下です。しかもCARTRUSTに最適化されているので、設定・運用の手間がかかりません。」

---

# 12. リスクと回避策

| リスク | 回避策 |
|---|---|
| 無制限修正要求 | 修正回数を契約で明確化（A:セルフ/B:1回）。超過は追加作業費。 |
| サポート過多 | Aはセルフサービス設計。Bはヒアリングシートで要件を事前確定。 |
| 法務責任の誤認 | 申込時に「弁護士レビュー不含」を明示。利用規約で責任分界を記載。 |
| デザイン自由度要求の肥大化 | config_jsonスキーマで変更可能項目を厳格に制限。 |
| テナント間差異の管理複雑化 | 構造化カスタム（config_json）で差異をデータ化。レイアウトはlayout_keyで管理。 |
| 価格が安すぎて採算悪化 | 初期費用で制作コスト回収。月額で継続収益。6ヶ月縛り。 |
| 管理画面の複雑化 | テンプレオプションを独立タブに分離。既存画面には影響しない。 |
| テンプレートと証明ロジックの密結合 | config_jsonで見た目を分離。証明書のコアロジック（public_id, status, vehicle_info等）には触れない。 |
| 運用担当不在 | Aはセルフサービスで人手不要。Bは月2〜3件を想定し、1名のオペレータで運用可能な設計。 |

---

# 13. 実装フェーズ

## Phase 1: MVP（すぐ売れる最低限）— 2〜3週間
- [ ] `platform_templates` テーブル + 3種類の既製テンプレート登録
- [ ] `tenant_template_configs` テーブル + config_json 保存
- [ ] `tenant_option_subscriptions` テーブル
- [ ] `/admin/template-options` ページ（テンプレ選択・設定・プレビュー）
- [ ] `/api/template-options/subscribe` （Stripe Checkout）
- [ ] `renderBrandedCertificate.tsx`（config_jsonを反映したPDF生成）
- [ ] 既存の証明書発行フローに「ブランドテンプレ使用」の分岐追加
- [ ] Stripe Product/Price 作成 + Webhook対応
- [ ] A商品の販売開始

## Phase 2: 制作代行 + 管理強化 — 3〜4週間
- [ ] `template_orders` + `template_order_logs` テーブル
- [ ] `template_assets` テーブル
- [ ] `/admin/template-options/order` （B申込フォーム）
- [ ] `/admin/platform/template-orders` （管理者オーダー管理）
- [ ] ヒアリングシート・素材アップロード機能
- [ ] ステータス管理・タイムライン表示
- [ ] 追加作業のStripe Invoice発行
- [ ] B商品の販売開始

## Phase 3: 将来拡張 — 必要に応じて
- [ ] テンプレートギャラリーの充実（10種類以上）
- [ ] レイアウトバリエーション追加（layout_key拡張）
- [ ] テンプレートのリアルタイムプレビュー（WYSIWYG風）
- [ ] 加盟店間のテンプレート共有・マーケットプレイス
- [ ] メンテナンスURLのアクセス解析
- [ ] A→Bアップグレードの自動差額計算

---

# 14. 最終推奨案

| 項目 | 推奨 |
|---|---|
| **商品名** | A: ブランド証明書 ライト / B: ブランド証明書 プレミアム |
| **料金** | A: 初期¥16,500+月額¥3,300 / B: 初期¥88,000+月額¥4,400 |
| **提供範囲** | A: セルフ設定（ロゴ・配色・文言） / B: 制作代行（修正1回込み） |
| **管理画面** | `/admin/template-options` 配下に独立セクション |
| **DB** | 6テーブル追加（上記SQL）、config_jsonで構造化カスタム |
| **運用** | A: セルフサービス / B: 月2〜3件想定・オペレータ1名 |
| **Phase 1** | A商品+Stripe決済+既製テンプレ3種+ブランドPDF生成 |
| **今は切る** | C書類パック、テンプレートエディタ、マーケットプレイス |

---

# 検証方法
1. マイグレーション適用後、`platform_templates` に3件のテストデータを投入
2. テスト用テナントでA契約フローを実行（Stripe test mode）
3. config_json を設定し、ブランド反映された証明書PDFが出力されることを確認
4. テスト発行制限（月3回）が正しく動作することを確認
5. Stripe Webhook で `invoice.paid` → `tenant_option_subscriptions` が `active` になることを確認
6. 未契約テナントからはテンプレ設定画面にアクセスできないことを確認
