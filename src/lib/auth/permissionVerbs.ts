/**
 * v2.0 §16 権限動詞・リスクレベル（IMP-013）。
 *
 * 既存の Permission 型（permissions.ts）は `resource:verb` 形式で 55 種が稼働中。
 * v2.0 は 7 つの正準動詞（VIEW/EDIT/CONFIRM/APPROVE/ISSUE/MANAGE/EXPORT）を定義
 * しているが、既存は view/create/edit/void/manage/delete/operate と語彙が異なる。
 *
 * ここでは:
 * - 正準動詞を型として定義（将来の Permission 文字列統一の土台）
 * - 既存 Permission → 正準動詞のマッピング
 * - 操作リスクレベル分類（IMP-012 step-up 認証と連携）
 *
 * 既存の Permission 型・ROLE_PERMISSIONS マトリクスは変更しない。
 */
import type { Permission } from "./permissions";

// ── 正準動詞 ──

/** v2.0 §16 の 7 正準権限動詞。 */
export const PERMISSION_VERBS = ["VIEW", "EDIT", "CONFIRM", "APPROVE", "ISSUE", "MANAGE", "EXPORT"] as const;

export type PermissionVerb = (typeof PERMISSION_VERBS)[number];

/**
 * 既存の Permission 文字列から正準動詞への対応。
 * ponytail: 完全な 1:1 対応ではない。create→EDIT, void→APPROVE, operate→MANAGE 等の
 * 意味的マッピング。Permission 文字列自体の改名は将来タスク（IMP-045 判断）。
 */
const VERB_MAP: Record<string, PermissionVerb> = {
  view: "VIEW",
  create: "EDIT",
  edit: "EDIT",
  delete: "EDIT",
  void: "APPROVE", // 証明書無効化は承認行為
  manage: "MANAGE",
  operate: "MANAGE",
};

/** 既存 Permission から正準動詞を導出する。 */
export function canonicalVerb(permission: Permission): PermissionVerb {
  const verb = permission.split(":")[1];
  return VERB_MAP[verb] ?? "VIEW";
}

// ── リスクレベル ──

/** 操作リスクレベル。step-up 認証（IMP-012）と監査レベル（IMP-014）の入力。 */
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Permission → リスクレベル。未登録は "low"（閲覧系のデフォルト）。
 *
 * 分類基準:
 * - critical: 不可逆・法的影響・プラットフォーム運営（void, billing, platform）
 * - high: 金銭・証明書・メンバー管理に影響する変更
 * - medium: 通常のデータ変更（予約・車両・顧客 CRUD）
 * - low: 閲覧のみ
 */
const OPERATION_RISK: Partial<Record<Permission, RiskLevel>> = {
  // Critical
  "certificates:void": "critical",
  "billing:manage": "critical",
  "platform:manage": "critical",
  "platform:operations": "critical",

  // High
  "certificates:create": "high",
  "certificates:edit": "high",
  "invoices:create": "high",
  "invoices:edit": "high",
  "payments:create": "high",
  "payments:manage": "high",
  "members:manage": "high",
  "stores:manage": "high",
  "settings:edit": "high",
  "vehicles:delete": "high",
  "insurers:manage": "high",

  // Medium
  "vehicles:create": "medium",
  "vehicles:edit": "medium",
  "customers:create": "medium",
  "customers:edit": "medium",
  "reservations:create": "medium",
  "reservations:edit": "medium",
  "market:create": "medium",
  "market:edit": "medium",
  "orders:create": "medium",
  "templates:manage": "medium",
  "menu_items:manage": "medium",
  "registers:manage": "medium",
  "register_sessions:manage": "medium",
  "register_sessions:operate": "medium",
  "template_options:manage": "medium",
  "site_content:manage": "medium",
  "logo:manage": "medium",
};

/** Permission のリスクレベルを返す。未登録（閲覧系）は "low"。 */
export function operationRisk(permission: Permission): RiskLevel {
  return OPERATION_RISK[permission] ?? "low";
}
