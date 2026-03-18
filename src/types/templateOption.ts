// ============================================================
// Template Option Types
// ============================================================

/** テンプレートオプション種別 */
export type TemplateOptionType = "preset" | "custom";

/** 制作オーダー種別 */
export type TemplateOrderType =
  | "preset_setup"
  | "custom_production"
  | "modification"
  | "additional";

/** オーダーステータス */
export type TemplateOrderStatus =
  | "pending_payment"
  | "paid"
  | "hearing"
  | "in_production"
  | "review"
  | "revision"
  | "test_issued"
  | "approved"
  | "active"
  | "suspended"
  | "cancelled";

/** オプションサブスクステータス */
export type OptionSubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "suspended";

/** アセット種別 */
export type TemplateAssetType =
  | "logo"
  | "brand_guide"
  | "reference"
  | "seal"
  | "other";

/** ログアクション種別 */
export type OrderLogAction =
  | "status_change"
  | "comment"
  | "asset_upload"
  | "revision_request"
  | "config_update";

// ---- config_json 構造 ----

export type LogoPosition = "top-left" | "top-center" | "top-right";
export type FontFamily = "noto-sans-jp" | "noto-serif-jp";
export type BorderStyle = "none" | "simple" | "double" | "elegant";
export type BackgroundVariant = "white" | "cream" | "light-gray";

export type TemplateConfigBranding = {
  logo_asset_id?: string;
  logo_position?: LogoPosition;
  logo_max_height?: number;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  company_name: string;
  company_address?: string;
  company_phone?: string;
  company_url?: string;
};

export type TemplateConfigHeader = {
  title?: string;
  subtitle?: string;
  show_issue_date?: boolean;
  show_certificate_no?: boolean;
};

export type TemplateConfigCustomSection = {
  title: string;
  content: string;
};

export type TemplateConfigBody = {
  show_customer_name?: boolean;
  show_vehicle_info?: boolean;
  show_service_details?: boolean;
  show_photos?: boolean;
  custom_sections?: TemplateConfigCustomSection[];
};

export type TemplateConfigFooter = {
  warranty_text?: string;
  notice_text?: string;
  show_qr?: boolean;
  show_cartrust_badge?: boolean;
  maintenance_url?: string;
  maintenance_label?: string;
  show_maintenance_qr?: boolean;
};

export type TemplateConfigStyle = {
  font_family?: FontFamily;
  border_style?: BorderStyle;
  background_variant?: BackgroundVariant;
};

export type TemplateConfig = {
  version: 1;
  branding: TemplateConfigBranding;
  header?: TemplateConfigHeader;
  body?: TemplateConfigBody;
  footer?: TemplateConfigFooter;
  style?: TemplateConfigStyle;
};

// ---- DB Row Types ----

export type PlatformTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  category: string;
  base_config: TemplateConfig;
  layout_key: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TenantTemplateConfigRow = {
  id: string;
  tenant_id: string;
  platform_template_id: string | null;
  option_type: TemplateOptionType;
  name: string;
  config_json: TemplateConfig;
  layout_key: string;
  is_active: boolean;
  is_default: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateOrderRow = {
  id: string;
  tenant_id: string;
  order_type: TemplateOrderType;
  status: TemplateOrderStatus;
  template_config_id: string | null;
  hearing_json: Record<string, unknown> | null;
  assets_json: Record<string, unknown> | null;
  notes: string | null;
  assigned_to: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  amount: number;
  revision_count: number;
  max_revisions: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateOrderLogRow = {
  id: string;
  order_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor: string | null;
  message: string | null;
  meta_json: Record<string, unknown> | null;
  created_at: string;
};

export type TemplateAssetRow = {
  id: string;
  tenant_id: string;
  template_config_id: string | null;
  asset_type: TemplateAssetType;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type TenantOptionSubscriptionRow = {
  id: string;
  tenant_id: string;
  option_type: TemplateOptionType;
  status: OptionSubscriptionStatus;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  template_config_id: string | null;
  started_at: string;
  cancelled_at: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

// ---- ステータス表示ラベル ----

export const ORDER_STATUS_LABELS: Record<TemplateOrderStatus, string> = {
  pending_payment: "決済待ち",
  paid: "決済完了",
  hearing: "ヒアリング中",
  in_production: "制作中",
  review: "レビュー中",
  revision: "修正中",
  test_issued: "テスト発行済",
  approved: "承認済",
  active: "公開中",
  suspended: "一時停止",
  cancelled: "キャンセル",
};

export const OPTION_TYPE_LABELS: Record<TemplateOptionType, string> = {
  preset: "ブランド証明書 ライト",
  custom: "ブランド証明書 プレミアム",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<OptionSubscriptionStatus, string> = {
  active: "有効",
  past_due: "支払い遅延",
  cancelled: "解約済み",
  suspended: "一時停止",
};
