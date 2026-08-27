/**
 * 店舗スコープ権限（IMP-013）。
 *
 * v2.0 §16: 多店舗テナントでスタッフの閲覧・操作範囲を店舗単位に制限する。
 *
 * 既存インフラ:
 * - DB: stores テーブル + store_memberships（role: manager/staff）
 * - RLS: テナントメンバーは全店舗を SELECT 可、admin+ は管理可
 * - reservations/certificates/market_vehicles に store_id カラムあり
 *
 * ここでは:
 * - store_memberships の型定義（DB スキーマ対応）
 * - 店舗スコープ付き権限コンテキスト型
 * - 純粋判定関数（DB アクセスは呼び出し側の責任）
 *
 * RLS はテナント分離を担保する。本モジュールはアプリ層で
 * 「テナント内のどの店舗にアクセスできるか」を判定する。
 */
import type { Role } from "./roles";
import { hasMinRole } from "./roles";

// ── 店舗メンバーシップ ──

/** DB CHECK 制約 `store_memberships.role IN ('manager', 'staff')` に対応。 */
export const STORE_MEMBERSHIP_ROLES = ["manager", "staff"] as const;
export type StoreMembershipRole = (typeof STORE_MEMBERSHIP_ROLES)[number];

/** store_memberships 行の型付き表現。 */
export type StoreAssignment = {
  storeId: string;
  role: StoreMembershipRole;
};

// ── スコープ付きコンテキスト ──

/**
 * 店舗スコープ付き権限コンテキスト。
 *
 * CallerInfo（checkRole.ts）を拡張する概念。CallerInfo はテナントレベルの
 * ロールを解決するが、店舗割当は含まない。本型は store_memberships から
 * 取得した割当を加えた完全なコンテキスト。
 *
 * DB からの取得は呼び出し側の責任。
 */
export type ScopedContext = {
  userId: string;
  tenantId: string;
  /** テナントレベルのロール（tenant_memberships.role） */
  role: Role;
  /** 割り当てられた店舗一覧（store_memberships から取得） */
  storeAssignments: StoreAssignment[];
};

// ── 店舗スコープ判定 ──

/**
 * admin 以上は店舗スコープを通過する（全店舗アクセス可）。
 *
 * ponytail: RLS の stores_tenant_manage は role IN ('owner', 'admin') で判定。
 * 閲覧（SELECT）は全メンバーに許可されているが、アプリ層のデータフィルタリング
 * （「この予約一覧は自分の店舗だけ」）は staff/viewer にのみ適用する。
 * admin 以上が全店舗を横断閲覧できないと運営に支障が出る。
 */
export function bypassesStoreScope(role: Role): boolean {
  return hasMinRole(role, "admin");
}

/** ユーザーが特定店舗にアクセスできるか。admin+ は常に true。 */
export function hasStoreAccess(ctx: ScopedContext, storeId: string): boolean {
  if (bypassesStoreScope(ctx.role)) return true;
  return ctx.storeAssignments.some((a) => a.storeId === storeId);
}

/**
 * 店舗内での実効ロールを返す。
 * - admin+: "manager" 相当（全店舗管理権限）
 * - staff/viewer で割当あり: store_memberships.role
 * - 割当なし: null（アクセス不可）
 */
export function effectiveStoreRole(ctx: ScopedContext, storeId: string): StoreMembershipRole | null {
  if (bypassesStoreScope(ctx.role)) return "manager";
  return ctx.storeAssignments.find((a) => a.storeId === storeId)?.role ?? null;
}

/** 特定店舗の店長（manager）か。admin+ も true。 */
export function isStoreManager(ctx: ScopedContext, storeId: string): boolean {
  return effectiveStoreRole(ctx, storeId) === "manager";
}

/**
 * ユーザーがアクセス可能な店舗 ID の一覧を返す。
 * admin+ は null（= 全店舗、フィルタ不要）。
 *
 * ponytail: null は「制限なし」。呼び出し側は null なら WHERE 句を省略し、
 * string[] なら `store_id IN (...)` を付加する。この規約で RLS の上に
 * アプリ層フィルタを重ねる。
 */
export function accessibleStoreIds(ctx: ScopedContext): string[] | null {
  if (bypassesStoreScope(ctx.role)) return null;
  return ctx.storeAssignments.map((a) => a.storeId);
}
