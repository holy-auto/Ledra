# 実装設計書

> 画面一覧・URLパス・コンポーネント分割・Stripe設計・RLS・状態管理・admin/tenant操作境界・
> 将来拡張耐性を含む、実装レベルの設計書。

---

## 1. ディレクトリ構成・ファイル一覧

```
src/
├── app/
│   ├── admin/
│   │   ├── template-options/                     # テナント向け画面群
│   │   │   ├── page.tsx                          # T1: TOP（契約状況+利用中テンプレ）
│   │   │   ├── gallery/
│   │   │   │   └── page.tsx                      # T2: テンプレートギャラリー
│   │   │   ├── configure/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx                  # T3: テンプレート設定
│   │   │   ├── preview/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx                  # T4: プレビュー
│   │   │   ├── order/
│   │   │   │   ├── page.tsx                      # T5: B申込 / 追加作業依頼
│   │   │   │   └── [orderId]/
│   │   │   │       └── page.tsx                  # T6: 制作ステータス確認
│   │   │   └── maintenance-url/
│   │   │       └── page.tsx                      # T7: メンテナンスURL設定
│   │   │
│   │   └── platform/                             # CARTRUST運営向け画面群
│   │       ├── templates/
│   │       │   └── page.tsx                      # A1: 既製テンプレート管理
│   │       ├── template-orders/
│   │       │   ├── page.tsx                      # A2: オーダー管理
│   │       │   └── [id]/
│   │       │       └── page.tsx                  # A3: オーダー詳細
│   │       └── template-subscriptions/
│   │           └── page.tsx                      # A4: オプション契約一覧
│   │
│   └── api/
│       └── template-options/
│           ├── gallery/
│           │   └── route.ts                      # GET: 既製テンプレート一覧
│           ├── subscribe/
│           │   └── route.ts                      # POST: A/B申込→Stripe Checkout
│           ├── configure/
│           │   └── route.ts                      # GET/PUT: テンプレ設定取得・保存
│           ├── preview/
│           │   └── route.ts                      # POST: プレビューPDF生成
│           ├── test-issue/
│           │   └── route.ts                      # POST: テスト発行
│           ├── orders/
│           │   ├── route.ts                      # GET/POST: オーダー一覧・作成
│           │   └── [id]/
│           │       ├── route.ts                  # GET/PUT: オーダー詳細・更新
│           │       └── status/
│           │           └── route.ts              # PUT: ステータス変更（管理者用）
│           ├── assets/
│           │   └── route.ts                      # POST: 素材アップロード
│           ├── maintenance-url/
│           │   └── route.ts                      # GET/PUT: メンテナンスURL設定
│           └── admin/
│               ├── templates/
│               │   └── route.ts                  # CRUD: 既製テンプレート管理（管理者用）
│               ├── orders/
│               │   └── route.ts                  # GET: 全オーダー一覧（管理者用）
│               ├── subscriptions/
│               │   └── route.ts                  # GET: 全契約一覧（管理者用）
│               └── invoice/
│                   └── route.ts                  # POST: 追加作業Invoice発行（管理者用）
│
├── components/
│   └── template-options/
│       ├── SubscriptionStatusCard.tsx             # 契約ステータス表示
│       ├── ActiveTemplateCard.tsx                 # 利用中テンプレート表示
│       ├── TemplateGalleryGrid.tsx                # ギャラリーグリッド
│       ├── TemplateGalleryCard.tsx                # ギャラリー個別カード
│       ├── TemplateDetailModal.tsx                # テンプレ詳細モーダル
│       ├── TemplateConfigForm.tsx                 # 設定フォーム（A/B兼用、権限で制御）
│       ├── BrandColorPicker.tsx                   # カラーピッカー
│       ├── LogoUploader.tsx                       # ロゴアップロード
│       ├── CertificatePreview.tsx                 # PDFプレビュー表示
│       ├── OrderForm.tsx                          # B申込フォーム
│       ├── ModificationRequestForm.tsx            # 追加作業依頼フォーム
│       ├── OrderTimeline.tsx                      # 制作進捗タイムライン
│       ├── OrderStatusBadge.tsx                   # ステータスバッジ
│       ├── MaintenanceUrlForm.tsx                 # URL設定フォーム
│       ├── AssetUploader.tsx                      # 素材アップロード
│       ├── TemplateOptionFeatureGate.tsx           # A/B権限ゲート
│       └── CampaignBanner.tsx                     # キャンペーン表示バナー
│
├── lib/
│   └── template-options/
│       ├── configSchema.ts                        # config_json の Zodスキーマ
│       ├── configDefaults.ts                      # デフォルト値定義
│       ├── configMerge.ts                         # base_config + tenant config のマージ
│       ├── accessControl.ts                       # A/B権限による編集範囲制御
│       ├── renderBrandedCertificate.tsx            # ブランド証明書PDFレンダラー
│       ├── stripe.ts                              # テンプレオプション用Stripe処理
│       ├── campaign.ts                            # キャンペーン残数管理
│       ├── testIssueLimit.ts                      # テスト発行回数制限
│       └── orderNumber.ts                         # オーダー番号生成
│
└── types/
    └── templateOption.ts                          # 全型定義
```

---

## 2. TypeScript 型定義

```typescript
// src/types/templateOption.ts

// --- Enums ---
export type TemplateOptionType = 'preset' | 'custom';
export type TemplateConfigStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type TemplateOrderType =
  | 'preset_setup'
  | 'custom_production'
  | 'modification'
  | 'additional_template'
  | 'redesign';
export type TemplateOrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'hearing'
  | 'in_production'
  | 'review'
  | 'revision'
  | 'test_issued'
  | 'approved'
  | 'active'
  | 'cancelled';
export type OptionSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended'
  | 'trialing';
export type TemplateAssetType =
  | 'logo'
  | 'brand_guide'
  | 'reference'
  | 'seal'
  | 'other';
export type OrderLogAction =
  | 'status_change'
  | 'comment'
  | 'asset_upload'
  | 'revision_request'
  | 'payment_received'
  | 'config_update'
  | 'preview_generated'
  | 'test_issued'
  | 'published';

// --- Row Types ---
export interface PlatformTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  category: string;
  base_config: TemplateConfig;
  layout_key: string;
  tags: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TenantTemplateConfig {
  id: string;
  tenant_id: string;
  platform_template_id: string | null;
  option_type: TemplateOptionType;
  name: string;
  config_json: TemplateConfig;
  layout_key: string;
  status: TemplateConfigStatus;
  is_default: boolean;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateOrder {
  id: string;
  tenant_id: string;
  template_config_id: string | null;
  order_type: TemplateOrderType;
  order_number: string;
  status: TemplateOrderStatus;
  hearing_json: HearingData | null;
  assets_summary: AssetSummary[] | null;
  amount: number;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_invoice_id: string | null;
  revision_count: number;
  max_revisions: number;
  assigned_to: string | null;
  due_date: string | null;
  internal_notes: string | null;
  tenant_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantOptionSubscription {
  id: string;
  tenant_id: string;
  option_type: TemplateOptionType;
  status: OptionSubscriptionStatus;
  template_config_id: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  started_at: string;
  current_period_end: string | null;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  campaign_code: string | null;
  discount_amount: number | null;
  created_at: string;
  updated_at: string;
}

// --- config_json Structure ---
export interface TemplateConfig {
  version: 1;
  branding: {
    logo_asset_id?: string;
    logo_position?: 'top-left' | 'top-center' | 'top-right';
    logo_max_height_px?: number;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    company_name: string;
    company_name_en?: string;
    company_address?: string;
    company_phone?: string;
    company_email?: string;
    company_url?: string;
  };
  header?: {
    title?: string;
    subtitle?: string;
    show_issue_date?: boolean;
    show_certificate_no?: boolean;
    date_format?: string;
  };
  body?: {
    show_customer_name?: boolean;
    show_vehicle_info?: boolean;
    show_service_details?: boolean;
    show_photos?: boolean;
    photo_layout?: 'grid-2' | 'grid-3' | 'single';
    customer_label?: string;
    vehicle_fields?: string[];
    custom_sections?: Array<{
      title: string;
      content: string;
      position?: 'before_footer' | 'after_service' | 'after_photos';
    }>;
  };
  footer?: {
    warranty_text?: string;
    notice_text?: string;
    show_qr?: boolean;
    show_cartrust_badge?: boolean;
    show_company_seal?: boolean;
    maintenance_urls?: Array<{
      url: string;
      label: string;
      show_qr?: boolean;
    }>;
    footer_text?: string;
  };
  style?: {
    font_family?: 'noto-sans-jp' | 'noto-serif-jp';
    border_style?: 'none' | 'simple' | 'double' | 'elegant' | 'rounded';
    background_variant?: 'white' | 'cream' | 'light-gray' | 'dark';
    header_style?: 'standard' | 'centered' | 'minimal' | 'bold';
    divider_style?: 'line' | 'dotted' | 'none' | 'double';
  };
}

// --- Hearing / Assets ---
export interface HearingData {
  company_name: string;
  company_formal_name?: string;
  company_address?: string;
  company_phone?: string;
  contact_email: string;
  contact_person: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  reference_url?: string;
  certificate_title?: string;
  warranty_text?: string;
  notice_text?: string;
  additional_items?: string;
  exclude_items?: string;
  maintenance_url?: string;
  maintenance_label?: string;
  show_maintenance_qr?: boolean;
  design_requests?: string;
  reference_certificates?: string;
  estimated_volume?: string;
}

export interface AssetSummary {
  name: string;
  path: string;
  type: TemplateAssetType;
  size: number;
  content_type: string;
}
```

---

## 3. Zod バリデーション

```typescript
// src/lib/template-options/configSchema.ts

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const maintenanceUrlSchema = z.object({
  url: z.string().url().max(500),
  label: z.string().max(50).default('メンテナンス情報'),
  show_qr: z.boolean().default(false),
});

const customSectionSchema = z.object({
  title: z.string().min(1).max(30),
  content: z.string().min(1).max(500),
  position: z.enum(['before_footer', 'after_service', 'after_photos']).default('before_footer'),
});

export const templateConfigSchema = z.object({
  version: z.literal(1),
  branding: z.object({
    logo_asset_id: z.string().uuid().optional(),
    logo_position: z.enum(['top-left', 'top-center', 'top-right']).default('top-left'),
    logo_max_height_px: z.number().int().min(20).max(80).default(40),
    primary_color: hexColor.default('#1a1a1a'),
    secondary_color: hexColor.default('#666666'),
    accent_color: hexColor.default('#0071e3').optional(),
    company_name: z.string().min(1).max(100),
    company_name_en: z.string().max(100).optional(),
    company_address: z.string().max(200).optional(),
    company_phone: z.string().max(20).optional(),
    company_email: z.string().email().max(100).optional(),
    company_url: z.string().url().max(200).optional(),
  }),
  header: z.object({
    title: z.string().max(30).default('施工証明書'),
    subtitle: z.string().max(50).optional(),
    show_issue_date: z.boolean().default(true),
    show_certificate_no: z.literal(true).default(true),  // 必須: 常にtrue
    date_format: z.enum(['yyyy年MM月dd日', 'yyyy/MM/dd', 'yyyy-MM-dd']).default('yyyy年MM月dd日'),
  }).optional(),
  body: z.object({
    show_customer_name: z.literal(true).default(true),      // 必須: 常にtrue
    show_vehicle_info: z.literal(true).default(true),       // 必須: 常にtrue
    show_service_details: z.literal(true).default(true),    // 必須: 常にtrue
    show_photos: z.boolean().default(true),
    photo_layout: z.enum(['grid-2', 'grid-3', 'single']).default('grid-2'),
    customer_label: z.string().max(20).default('お客様名'),
    vehicle_fields: z.array(z.enum(['maker', 'model', 'year', 'plate_display', 'color', 'vin'])).optional(),
    custom_sections: z.array(customSectionSchema).max(3).optional(),
  }).optional(),
  footer: z.object({
    warranty_text: z.string().max(500).optional(),
    notice_text: z.string().max(500).optional(),
    show_qr: z.boolean().default(true),
    show_cartrust_badge: z.literal(true).default(true),  // 必須: 常にtrue
    show_company_seal: z.boolean().default(false),
    maintenance_urls: z.array(maintenanceUrlSchema).max(3).optional(),
    footer_text: z.string().max(200).optional(),
  }).optional(),
  style: z.object({
    font_family: z.enum(['noto-sans-jp', 'noto-serif-jp']).default('noto-sans-jp'),
    border_style: z.enum(['none', 'simple', 'double', 'elegant', 'rounded']).default('simple'),
    background_variant: z.enum(['white', 'cream', 'light-gray', 'dark']).default('white'),
    header_style: z.enum(['standard', 'centered', 'minimal', 'bold']).default('standard'),
    divider_style: z.enum(['line', 'dotted', 'none', 'double']).default('line'),
  }).optional(),
});

// option_type に応じた制限を適用するリファインメント
export function validateConfigForOptionType(
  config: z.infer<typeof templateConfigSchema>,
  optionType: 'preset' | 'custom'
) {
  const errors: string[] = [];

  if (optionType === 'preset') {
    // A契約: 文言200字制限
    if (config.footer?.warranty_text && config.footer.warranty_text.length > 200) {
      errors.push('ライトプランでは保証文言は200文字以内です');
    }
    // A契約: メンテナンスURL 1件制限
    if (config.footer?.maintenance_urls && config.footer.maintenance_urls.length > 1) {
      errors.push('ライトプランではメンテナンスURLは1件までです');
    }
    // A契約: カスタムセクション不可
    if (config.body?.custom_sections && config.body.custom_sections.length > 0) {
      errors.push('ライトプランではカスタムセクションは追加できません');
    }
    // A契約: スタイル変更不可（accent_color, font, border, bg, header_style, divider）
    if (config.branding.accent_color) {
      errors.push('ライトプランではアクセントカラーは変更できません');
    }
  }

  return errors;
}
```

---

## 4. アクセス制御の実装方針

```typescript
// src/lib/template-options/accessControl.ts

import type { TemplateOptionType } from '@/types/templateOption';

// config_json の各フィールドに対する編集権限定義
const FIELD_ACCESS: Record<string, 'all' | 'custom_only' | 'admin_only' | 'readonly'> = {
  // branding
  'branding.logo_asset_id': 'all',
  'branding.logo_position': 'all',
  'branding.logo_max_height_px': 'all',
  'branding.primary_color': 'all',
  'branding.secondary_color': 'all',
  'branding.accent_color': 'custom_only',
  'branding.company_name': 'all',
  'branding.company_name_en': 'custom_only',
  'branding.company_address': 'all',
  'branding.company_phone': 'all',
  'branding.company_email': 'all',
  'branding.company_url': 'all',
  // header
  'header.title': 'custom_only',
  'header.subtitle': 'custom_only',
  'header.show_issue_date': 'all',
  'header.show_certificate_no': 'readonly',
  'header.date_format': 'all',
  // body
  'body.show_customer_name': 'readonly',
  'body.show_vehicle_info': 'readonly',
  'body.show_service_details': 'readonly',
  'body.show_photos': 'all',
  'body.photo_layout': 'custom_only',
  'body.customer_label': 'custom_only',
  'body.vehicle_fields': 'custom_only',
  'body.custom_sections': 'custom_only',
  // footer
  'footer.warranty_text': 'all',
  'footer.notice_text': 'all',
  'footer.show_qr': 'all',
  'footer.show_cartrust_badge': 'readonly',
  'footer.show_company_seal': 'all',
  'footer.maintenance_urls': 'all',
  'footer.footer_text': 'all',
  // style
  'style.font_family': 'custom_only',
  'style.border_style': 'custom_only',
  'style.background_variant': 'custom_only',
  'style.header_style': 'custom_only',
  'style.divider_style': 'custom_only',
};

export function canEditField(
  fieldPath: string,
  optionType: TemplateOptionType,
  isAdmin: boolean
): boolean {
  const access = FIELD_ACCESS[fieldPath];
  if (!access) return false;
  if (access === 'readonly') return false;
  if (access === 'admin_only') return isAdmin;
  if (access === 'custom_only') return optionType === 'custom' || isAdmin;
  return true; // 'all'
}

export function getEditableFields(
  optionType: TemplateOptionType,
  isAdmin: boolean
): string[] {
  return Object.entries(FIELD_ACCESS)
    .filter(([path]) => canEditField(path, optionType, isAdmin))
    .map(([path]) => path);
}
```

---

## 5. config マージロジック

```typescript
// src/lib/template-options/configMerge.ts

import type { TemplateConfig } from '@/types/templateOption';

/**
 * 既製テンプレートの base_config とテナント設定をディープマージ。
 * テナント側の明示的な設定値が優先。
 * readOnly 項目は base_config の値を強制。
 */
export function mergeConfigs(
  baseConfig: Partial<TemplateConfig>,
  tenantConfig: TemplateConfig
): TemplateConfig {
  const merged = deepMerge(baseConfig, tenantConfig) as TemplateConfig;

  // readOnly 項目を強制
  if (merged.header) merged.header.show_certificate_no = true;
  if (merged.body) {
    merged.body.show_customer_name = true;
    merged.body.show_vehicle_info = true;
    merged.body.show_service_details = true;
  }
  if (merged.footer) merged.footer.show_cartrust_badge = true;

  return merged;
}

function deepMerge(base: any, override: any): any {
  if (!base) return override;
  if (!override) return base;
  if (typeof base !== 'object' || typeof override !== 'object') return override;
  if (Array.isArray(override)) return override;

  const result: any = { ...base };
  for (const key of Object.keys(override)) {
    if (override[key] !== undefined) {
      result[key] = deepMerge(base[key], override[key]);
    }
  }
  return result;
}
```

---

## 6. admin / tenant の操作境界

### テナント（加盟店）ができること

| 操作 | API | 条件 |
|---|---|---|
| 既製テンプレ一覧取得 | GET `/api/template-options/gallery` | ログイン済み |
| A申込（Stripe Checkout） | POST `/api/template-options/subscribe` | admin/ownerロール |
| B申込（Stripe Checkout） | POST `/api/template-options/subscribe` | admin/ownerロール |
| config_json 取得 | GET `/api/template-options/configure` | A/B契約中 |
| config_json 更新 | PUT `/api/template-options/configure` | A/B契約中 + admin/owner |
| プレビュー生成 | POST `/api/template-options/preview` | A/B契約中 |
| テスト発行 | POST `/api/template-options/test-issue` | A/B契約中 + 月次上限内 |
| 自分のオーダー一覧取得 | GET `/api/template-options/orders` | ログイン済み |
| オーダー詳細取得 | GET `/api/template-options/orders/[id]` | 自テナントのオーダー |
| 追加作業依頼送信 | POST `/api/template-options/orders` | A/B契約中 + admin/owner |
| 素材アップロード | POST `/api/template-options/assets` | admin/owner |
| メンテナンスURL設定 | PUT `/api/template-options/maintenance-url` | A/B契約中 + admin/owner |
| オーダーにコメント送信 | PUT `/api/template-options/orders/[id]` | 自テナントのオーダー |

### テナントが **できない** こと
- `layout_key` の変更
- `readOnly` 項目の変更（customer_name表示ON/OFF等）
- オーダーのステータス変更（承認ボタンは除く）
- 他テナントのデータ参照
- 直接的なStripeサブスク操作
- `platform_templates` の変更

### 管理者（CARTRUST運営）ができること

| 操作 | API | 備考 |
|---|---|---|
| 既製テンプレCRUD | CRUD `/api/template-options/admin/templates` | service_role使用 |
| 全オーダー一覧取得 | GET `/api/template-options/admin/orders` | テナント横断 |
| オーダーステータス変更 | PUT `/api/template-options/orders/[id]/status` | service_role使用 |
| config_json 直接編集 | PUT `/api/template-options/configure` | readOnly含む全項目 |
| layout_key 変更 | PUT `/api/template-options/configure` | 管理者のみ |
| 追加作業Invoice発行 | POST `/api/template-options/admin/invoice` | Stripe Invoice API |
| 全契約一覧取得 | GET `/api/template-options/admin/subscriptions` | テナント横断 |
| テンプレ公開/停止 | PUT `/api/template-options/orders/[id]/status` | active/suspended |
| 内部メモ記入 | PUT `/api/template-options/orders/[id]` | テナントには非表示 |

### 管理者の判定方法

```typescript
// 方法1: テナントの tenant_memberships.role = 'owner' でかつ
//        プラットフォーム管理者フラグ（将来追加予定）
// 方法2: 当面は service_role (SUPABASE_SERVICE_ROLE_KEY) で管理画面APIを保護

// 管理者APIのガード例
async function requirePlatformAdmin(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-key');
  if (authHeader !== process.env.PLATFORM_ADMIN_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // service_role client を使用
  return supabaseAdmin;
}
```

---

## 7. RLS 考慮ポイント

### 設計原則
1. **テナントデータの分離**: `tenant_id IN (SELECT my_tenant_ids())` で自テナントのみアクセス
2. **管理者操作は service_role**: RLSをバイパスする管理者操作は全て service_role 経由
3. **platform_templates は全員読み取り可**: ギャラリー表示に必要
4. **template_order_logs の可視性制御**: `is_visible_to_tenant` で管理者メモを隠す

### 注意点
- `template_orders` の UPDATE ポリシーはテナント側に **付与しない**
  - テナントがステータスを直接変更できないようにする
  - テナントからのコメント追加は `template_order_logs` へのINSERTで実現
- `tenant_option_subscriptions` の INSERT/UPDATE は service_role のみ
  - Stripe Webhook経由でのみ作成・更新される
- テスト発行ログ（`template_test_issues`）はテナント側でINSERT可能
  - ただしAPI側で月次上限チェックを実施

### 将来の platform_admin ロール追加時
```sql
-- 将来: platform_admin テーブルを追加し、RLSポリシーに組み込み
-- CREATE TABLE platform_admins (user_id UUID PRIMARY KEY REFERENCES auth.users(id));
-- CREATE POLICY "admin_all" ON template_orders FOR ALL
--   USING (auth.uid() IN (SELECT user_id FROM platform_admins));
```

---

## 8. 将来のテンプレート追加時に破綻しない設計

### 設計のポイント

1. **layout_key の分離**: レイアウトはconfig_jsonではなく `layout_key` で識別。新レイアウト追加時はPDF描画ロジックに分岐を追加するだけ。

2. **config_json の version フィールド**: スキーマ変更時にマイグレーション関数で自動変換。
```typescript
function migrateConfig(config: any): TemplateConfig {
  if (!config.version || config.version < 1) {
    // v0 → v1 マイグレーション
    return { version: 1, branding: { company_name: config.company_name ?? '' }, ...config };
  }
  // 将来: v1 → v2 マイグレーション
  return config;
}
```

3. **platform_templates の tags / category**: 新テンプレ追加時はINSERTするだけ。カテゴリやタグでフィルタリング。

4. **layout_key と PDF描画の疎結合**:
```typescript
// renderBrandedCertificate.tsx
function selectLayout(layoutKey: string): React.FC<CertificateLayoutProps> {
  const layouts: Record<string, React.FC<CertificateLayoutProps>> = {
    standard: StandardLayout,
    premium: PremiumLayout,
    elegant: ElegantLayout,
    modern: ModernLayout,
    classic: ClassicLayout,
  };
  return layouts[layoutKey] ?? layouts.standard;
}
```

5. **config_json の additionalProperties: false**: 未定義フィールドの混入を防止。拡張時はスキーマバージョンを上げる。

6. **テンプレート数上限の柔軟な変更**: `tenant_option_subscriptions` に `max_templates` カラムを持たせれば、プランごとの上限を動的に変更可能。

---

## 9. 実装フェーズ詳細

### Phase 1: MVP（2〜3週間）— A商品の販売開始

**やること:**
1. Supabase マイグレーション実行（全テーブル作成）
2. `platform_templates` に3〜5件の既製テンプレートを登録
3. T1: テンプレートオプションTOP画面
4. T2: テンプレートギャラリー画面
5. T3: テンプレート設定画面（config_json の保存）
6. T4: プレビュー画面
7. Stripe Checkout（A申込: 初期費用+月額）
8. Stripe Webhook（checkout.session.completed）
9. `renderBrandedCertificate.tsx`（既存pdfCertificate.tsxの拡張）
10. 証明書発行フローに「ブランドテンプレ適用」の分岐追加
11. 既存FeatureGuardにオプション契約チェック追加

**やらないこと:**
- B申込（制作代行）
- 管理者画面（A1〜A4）
- オーダー管理
- 追加作業Invoice
- キャンペーン

### Phase 2: 制作代行+管理強化（3〜4週間）

**やること:**
1. T5: B申込フォーム
2. T6: 制作ステータス確認画面
3. T7: メンテナンスURL設定画面
4. A1: 既製テンプレート管理画面
5. A2: オーダー管理画面
6. A3: オーダー詳細画面
7. A4: オプション契約一覧画面
8. B の Stripe Checkout（初期費用のみ）
9. B の月額サブスク作成（公開時）
10. 追加作業のStripe Invoice発行
11. メール通知（申込完了・レビュー依頼・公開完了）
12. キャンペーン機能（先着100社）

### Phase 3: 将来拡張（必要に応じて）

- テンプレートギャラリーの拡充（10種類以上）
- リアルタイムプレビュー（config変更即反映）
- A→Bアップグレードの自動差額計算
- テンプレートのバージョン管理（ロールバック機能）
- メンテナンスURLのアクセス解析
- platform_admin ロール（service_roleから移行）
- テンプレートの複数同時利用（証明書発行時に選択）
