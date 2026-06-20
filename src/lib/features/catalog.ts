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

export type FeatureGroupKey = "operations" | "customers" | "revenue" | "trade" | "knowledge" | "settings";

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
}

/** Groups that contain at least one ADVANCED feature (drives the settings UI). */
export const FEATURE_GROUPS: readonly FeatureGroupDef[] = [
  { key: "operations", label: "業務" },
  { key: "customers", label: "顧客" },
  { key: "revenue", label: "売上・経営" },
  { key: "trade", label: "取引ハブ" },
  { key: "knowledge", label: "情報・学習" },
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
