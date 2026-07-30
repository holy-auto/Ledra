import type { Permission } from "@/lib/auth/permissions";

/**
 * Feature visibility catalog — the single source of truth for the
 * "advanced features hidden by default" experience.
 *
 * - CORE features are always visible (subject to existing role/plan gates).
 * - ADVANCED features are hidden by default and surfaced via two layers:
 *     1. Tenant availability gate (owner/admin can disable per tenant).
 *     2. Per-user visibility opt-in (each user shows what they want).
 *
 * `key` values are persisted in the database (tenant_feature_settings /
 * user_feature_prefs). They are intentionally decoupled from `href` so a
 * route can move without orphaning saved preferences — never rename or
 * reuse a key without a data migration.
 *
 * This module is pure data (no JSX, no client/server-only imports) so it
 * can be shared by the Sidebar (client), the settings UI (client) and the
 * API routes (server) without drift.
 */

export type FeatureTier = "core" | "advanced";

export type FeatureGroupKey =
  "operations" | "customers" | "revenue" | "trade" | "knowledge" | "accounting" | "settings";

/**
 * 業種別モード（整備 / 鈑金塗装 / コーティング / PPF）。"all" はモード未選択
 * (フィルタなし) を表す。ユーザーがサイドバーの表示を絞り込む際に使う軸で、
 * FeatureDef.businessModes とは独立: モードはユーザーが都度選ぶ状態、
 * businessModes はその機能がどのモードで使われるかという静的な分類。
 */
export type BusinessMode = "mechanic" | "body_paint" | "coating" | "ppf";

export interface FeatureGroupDef {
  key: FeatureGroupKey;
  label: string;
}

export interface FeatureDef {
  /** Stable identifier persisted in the DB. Never rename/reuse without a migration. */
  key: string;
  href: string;
  label: string;
  groupKey: FeatureGroupKey;
  tier: FeatureTier;
  requiredPermission?: Permission;
  /**
   * この機能が関係する業種。未指定 = 共通機能として全モードで常時表示。
   *
   * ponytail: 現時点では「明らかに一業種向け」と判断できた項目のみ手動でタグ付けした
   * 初期分類。天井: 新規機能を追加してもタグ漏れを検知する仕組みが無い（lint/test 不在）
   * ため、業種別の絞り込みは漏れがある前提で見る必要がある。アップグレード時は、現場の
   * レビューで全 advanced 項目の businessModes を確定させ、カタログ整合性テストで
   * 「advanced タグ付き機能は必ず businessModes を持つ」ことを検証する形にする。
   */
  businessModes?: readonly BusinessMode[];
}

/** Groups that contain at least one ADVANCED feature (drives the settings UI). */
export const FEATURE_GROUPS: readonly FeatureGroupDef[] = [
  { key: "operations", label: "業務" },
  { key: "customers", label: "顧客" },
  { key: "revenue", label: "売上・経営" },
  { key: "trade", label: "取引ハブ" },
  { key: "knowledge", label: "情報・学習" },
  { key: "accounting", label: "経理" },
  { key: "settings", label: "設定" },
];

/**
 * Every sidebar feature that participates in tiering. Items intentionally
 * omitted: unreleased (`hidden`) entries and `/admin/platform/*` ops-only
 * tools — those keep their existing permission/hidden gating untouched and
 * are treated as CORE (never hidden by this layer).
 */
export const FEATURES: readonly FeatureDef[] = [
  // Core dashboard
  {
    key: "dashboard",
    href: "/admin",
    label: "ダッシュボード",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "dashboard:view",
  },
  {
    key: "inbox",
    href: "/admin/inbox",
    label: "承認インボックス",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "dashboard:view",
  },

  // 業務
  {
    key: "reservations",
    href: "/admin/reservations",
    label: "予約管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:view",
  },
  {
    key: "workflow-templates",
    href: "/admin/workflow-templates",
    label: "ワークフロー",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "reservations:view",
  },
  {
    key: "mechanic-gantt",
    href: "/admin/mechanic-gantt",
    label: "メカニック稼働管理",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "reservations:view",
  },
  {
    key: "certificates",
    href: "/admin/certificates",
    label: "証明書",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "certificates:view",
  },
  {
    // core (always visible for payments:view roles): the whole point of
    // this feature is that merchants SEE their records earning — hiding it
    // behind the advanced opt-in would defeat that. Empty state explains it.
    key: "report-revenue",
    href: "/admin/report-revenue",
    label: "レポート収益",
    groupKey: "revenue",
    tier: "core",
    requiredPermission: "payments:view",
  },
  {
    key: "vehicles",
    href: "/admin/vehicles",
    label: "車両管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "vehicles:view",
  },
  {
    key: "thickness-reports",
    href: "/admin/thickness-reports",
    label: "膜厚測定",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "vehicles:view",
    businessModes: ["coating", "ppf"],
  },
  {
    key: "booking-settings",
    href: "/admin/booking-settings",
    label: "予約受付設定",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "settings:view",
  },
  {
    key: "menu-items",
    href: "/admin/menu-items",
    label: "品目マスタ",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "menu_items:manage",
  },
  {
    key: "service-packages",
    href: "/admin/service-packages",
    label: "施工パッケージ",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "menu_items:manage",
  },
  {
    key: "inventory",
    href: "/admin/inventory",
    label: "在庫管理",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "menu_items:manage",
  },
  {
    key: "nfc",
    href: "/admin/nfc",
    label: "NFC管理",
    groupKey: "operations",
    tier: "advanced",
    requiredPermission: "vehicles:view",
  },
  {
    key: "body-repair",
    href: "/admin/body-repair",
    label: "鈑金工程",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:view",
    businessModes: ["body_paint"],
  },
  {
    key: "booths",
    href: "/admin/booths",
    label: "ピット管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:view",
  },
  {
    key: "contact-schedules",
    href: "/admin/contact-schedules",
    label: "コンタクト管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "customers:view",
  },
  {
    key: "coupons",
    href: "/admin/coupons",
    label: "クーポン管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "customers:view",
  },
  {
    key: "loaner-cars",
    href: "/admin/loaner-cars",
    label: "代車管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:view",
    businessModes: ["mechanic"],
  },
  {
    key: "maintenance-packs",
    href: "/admin/maintenance-packs",
    label: "メンテパック",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "menu_items:manage",
    businessModes: ["mechanic"],
  },
  {
    key: "next-touch",
    href: "/admin/next-touch",
    label: "次の接触",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "menu_items:manage",
  },
  {
    key: "notification-logs",
    href: "/admin/notification-logs",
    label: "通知配信状況",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "menu_items:manage",
  },
  {
    key: "parts-install-new",
    href: "/admin/parts-install/new",
    label: "装着記録",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:edit",
    businessModes: ["mechanic", "body_paint"],
  },
  {
    key: "parts-orders",
    href: "/admin/parts-orders",
    label: "部品発注",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:view",
    businessModes: ["mechanic", "body_paint"],
  },
  {
    key: "purchase-orders",
    href: "/admin/purchase-orders",
    label: "発注管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "menu_items:manage",
    businessModes: ["mechanic", "body_paint"],
  },
  {
    key: "quick-quote",
    href: "/admin/quick-quote",
    label: "概算見積",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "reservations:view",
  },
  {
    key: "service-reminders",
    href: "/admin/service-reminders",
    label: "整備提案・交換管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "menu_items:manage",
    businessModes: ["mechanic"],
  },
  {
    key: "settings-follow-up",
    href: "/admin/settings/follow-up",
    label: "フォローアップ設定",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "settings:view",
  },
  {
    key: "staff",
    href: "/admin/staff",
    label: "スタッフ管理",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "members:view",
  },
  {
    key: "tire-storage",
    href: "/admin/tire-storage",
    label: "タイヤ保管",
    groupKey: "operations",
    tier: "core",
    requiredPermission: "vehicles:view",
    businessModes: ["mechanic"],
  },

  // 顧客
  {
    key: "customers",
    href: "/admin/customers",
    label: "顧客管理",
    groupKey: "customers",
    tier: "core",
    requiredPermission: "customers:view",
  },
  {
    key: "hearing",
    href: "/admin/hearing",
    label: "ヒアリング",
    groupKey: "customers",
    tier: "advanced",
    requiredPermission: "customers:view",
  },
  {
    key: "hearing-branding",
    href: "/admin/hearing/branding",
    label: "導入ヒアリング",
    groupKey: "customers",
    tier: "advanced",
    requiredPermission: "customers:view",
  },
  {
    key: "inquiries",
    href: "/admin/inquiries",
    label: "問い合わせ",
    groupKey: "customers",
    tier: "advanced",
    requiredPermission: "market:view",
  },
  {
    key: "line-broadcasts",
    href: "/admin/line-broadcasts",
    label: "LINE配信",
    groupKey: "customers",
    tier: "core",
    requiredPermission: "customers:view",
  },
  {
    key: "messages",
    href: "/admin/messages",
    label: "メッセージ",
    groupKey: "customers",
    tier: "core",
    requiredPermission: "customers:view",
  },
  {
    key: "reviews",
    href: "/admin/reviews",
    label: "レビュー",
    groupKey: "customers",
    tier: "core",
    requiredPermission: "customers:view",
  },
  {
    key: "shop-announcements",
    href: "/admin/shop-announcements",
    label: "店舗お知らせ",
    groupKey: "customers",
    tier: "core",
    requiredPermission: "customers:view",
  },

  // 売上・経営
  {
    key: "invoices",
    href: "/admin/invoices",
    label: "請求・帳票",
    groupKey: "revenue",
    tier: "core",
    requiredPermission: "invoices:view",
  },
  {
    key: "square",
    href: "/admin/square",
    label: "Square 売上",
    groupKey: "revenue",
    tier: "advanced",
    requiredPermission: "payments:view",
  },
  {
    key: "management",
    href: "/admin/management",
    label: "経営分析",
    groupKey: "revenue",
    tier: "advanced",
    requiredPermission: "management:view",
  },
  {
    key: "pos",
    href: "/admin/pos",
    label: "POS 会計",
    groupKey: "revenue",
    tier: "core",
    requiredPermission: "register_sessions:operate",
  },
  {
    key: "price-stats",
    href: "/admin/price-stats",
    label: "施工価格相場",
    groupKey: "revenue",
    tier: "core",
    requiredPermission: "price_stats:view",
  },

  // 取引ハブ
  {
    key: "trades",
    href: "/admin/trades",
    label: "取引ダッシュボード",
    groupKey: "trade",
    tier: "advanced",
    requiredPermission: "market:view",
  },
  {
    key: "btob",
    href: "/admin/btob",
    label: "BtoBプラットフォーム",
    groupKey: "trade",
    tier: "advanced",
    requiredPermission: "market:view",
  },
  {
    key: "orders",
    href: "/admin/orders",
    label: "案件受発注",
    groupKey: "trade",
    tier: "advanced",
    requiredPermission: "orders:view",
  },
  {
    key: "agents",
    href: "/admin/agents",
    label: "代理店管理",
    groupKey: "trade",
    tier: "advanced",
    requiredPermission: "insurers:view",
  },
  {
    key: "agent-hub",
    href: "/admin/agent-hub",
    label: "代理店ハブ",
    groupKey: "trade",
    tier: "advanced",
    requiredPermission: "insurers:view",
  },
  {
    key: "agent-commissions",
    href: "/admin/agent-commissions",
    label: "代理店コミッション",
    groupKey: "trade",
    tier: "core",
    requiredPermission: "insurers:view",
  },
  {
    key: "deals",
    href: "/admin/deals",
    label: "商談管理",
    groupKey: "trade",
    tier: "core",
    requiredPermission: "market:view",
  },
  {
    key: "insurers",
    href: "/admin/insurers",
    label: "保険会社管理",
    groupKey: "trade",
    tier: "core",
    requiredPermission: "insurers:view",
  },
  {
    key: "market-vehicles",
    href: "/admin/market-vehicles",
    label: "マーケット車両",
    groupKey: "trade",
    tier: "core",
    requiredPermission: "market:view",
  },

  // 情報・学習
  {
    key: "announcements",
    href: "/admin/announcements",
    label: "お知らせ",
    groupKey: "knowledge",
    tier: "core",
    requiredPermission: "announcements:view",
  },
  {
    key: "site-content",
    href: "/admin/site-content",
    label: "HPコンテンツ",
    groupKey: "knowledge",
    tier: "advanced",
    requiredPermission: "site_content:view",
  },
  {
    key: "news",
    href: "/admin/news",
    label: "業界ニュース",
    groupKey: "knowledge",
    tier: "advanced",
    requiredPermission: "news:view",
  },
  { key: "academy", href: "/admin/academy", label: "Ledra Academy", groupKey: "knowledge", tier: "advanced" },
  { key: "academy-cases", href: "/admin/academy/cases", label: "施工事例", groupKey: "knowledge", tier: "advanced" },
  { key: "academy-qa", href: "/admin/academy/qa", label: "QAアシスタント", groupKey: "knowledge", tier: "advanced" },
  {
    key: "academy-feedback",
    href: "/admin/academy/feedback",
    label: "AI添削",
    groupKey: "knowledge",
    tier: "advanced",
  },

  // 経理
  {
    key: "payment-ledger",
    href: "/admin/payment-ledger",
    label: "売掛元帳",
    groupKey: "accounting",
    tier: "core",
    requiredPermission: "invoices:view",
  },

  // 設定
  {
    key: "settings",
    href: "/admin/settings",
    label: "店舗設定",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "settings:view",
  },
  {
    key: "stores",
    href: "/admin/stores",
    label: "店舗管理",
    groupKey: "settings",
    tier: "advanced",
    requiredPermission: "stores:view",
  },
  {
    key: "members",
    href: "/admin/members",
    label: "メンバー",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "members:view",
  },
  {
    key: "template-options",
    href: "/admin/template-options",
    label: "ブランド証明書",
    groupKey: "settings",
    tier: "advanced",
    requiredPermission: "template_options:view",
  },
  {
    key: "logo",
    href: "/admin/logo",
    label: "ロゴ",
    groupKey: "settings",
    tier: "advanced",
    requiredPermission: "logo:manage",
  },
  {
    key: "shop",
    href: "/admin/shop",
    label: "ショップ",
    groupKey: "settings",
    tier: "advanced",
    requiredPermission: "shop:view",
  },
  {
    key: "billing",
    href: "/admin/billing",
    label: "請求・プラン",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "billing:view",
  },
  {
    key: "audit",
    href: "/admin/audit",
    label: "操作履歴",
    groupKey: "settings",
    tier: "advanced",
    requiredPermission: "audit:view",
  },
  {
    key: "hq-overview",
    href: "/admin/hq-overview",
    label: "本社横断ビュー",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "stores:manage",
  },
  {
    key: "inspection-templates",
    href: "/admin/inspection-templates",
    label: "点検テンプレート",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "settings:view",
    businessModes: ["mechanic"],
  },
  {
    key: "integrations",
    href: "/admin/integrations",
    label: "API連携",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "settings:view",
  },
  {
    key: "organizations",
    href: "/admin/organizations",
    label: "組織管理",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "stores:manage",
  },
  {
    key: "settings-customer-ranks",
    href: "/admin/settings/customer-ranks",
    label: "顧客ランク",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "settings:view",
  },
  {
    key: "stocktake",
    href: "/admin/stocktake",
    label: "在庫棚卸",
    groupKey: "settings",
    tier: "core",
    requiredPermission: "menu_items:manage",
  },
];

export const FEATURE_BY_KEY: ReadonlyMap<string, FeatureDef> = new Map(FEATURES.map((f) => [f.key, f]));

export const FEATURE_BY_HREF: ReadonlyMap<string, FeatureDef> = new Map(FEATURES.map((f) => [f.href, f]));

export const ADVANCED_FEATURE_KEYS: ReadonlySet<string> = new Set(
  FEATURES.filter((f) => f.tier === "advanced").map((f) => f.key),
);

/** A feature key that is known AND advanced (the only thing we persist). */
export function isKnownAdvancedFeature(key: unknown): key is string {
  return typeof key === "string" && ADVANCED_FEATURE_KEYS.has(key);
}

/**
 * Coerce arbitrary input into a clean, deduped list of known advanced
 * feature keys. Used at the API boundary so persisted state can never
 * contain unknown / core / non-string keys.
 */
export function sanitizeFeatureKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const v of input) {
    if (isKnownAdvancedFeature(v)) out.add(v);
  }
  return [...out];
}

/**
 * Pure visibility resolution for an ADVANCED feature.
 *
 * Visible only when the tenant has not disabled it AND the user has
 * explicitly opted it into their sidebar. CORE features never call this
 * (they are always visible).
 */
export function isAdvancedFeatureVisible(
  key: string,
  tenantDisabled: ReadonlySet<string>,
  userVisible: ReadonlySet<string>,
): boolean {
  if (tenantDisabled.has(key)) return false;
  return userVisible.has(key);
}

/** Tier for a sidebar href; unknown hrefs are treated as CORE (never gated). */
export function featureTierForHref(href: string): FeatureTier {
  return FEATURE_BY_HREF.get(href)?.tier ?? "core";
}

/**
 * Business-mode visibility for a sidebar href.
 *
 * `null` selectedMode ("all") never filters. A feature with no
 * `businessModes` tag is treated as common — always visible regardless of
 * the selected mode. Only explicitly-tagged features are narrowed.
 */
export function isVisibleInBusinessMode(href: string, selectedMode: BusinessMode | null): boolean {
  if (!selectedMode) return true;
  const modes = FEATURE_BY_HREF.get(href)?.businessModes;
  if (!modes) return true;
  return modes.includes(selectedMode);
}
