/**
 * ワークスコープ（作業範囲切替）型定義（IMP-020）。
 *
 * v2.0 §2: Role 別スコープ — 自分 / 店舗 / 全店舗 の3段階で
 * リスト画面のデータ表示範囲を切り替える。
 *
 * IMP-013 の storeScope.ts（店舗アクセス判定）と補完関係:
 * - storeScope.ts: 「アクセスできるか」の判定（純粋関数）
 * - scope.ts（本ファイル）: 「何を表示するか」の切替（UI 状態）
 *
 * admin+ は全3段階を使用可能、staff は自分/店舗のみ。
 * viewer は自分のみ。
 *
 * ponytail: 型定義 + 判定関数のみ。React Context / Provider は
 * 消費側（IMP-021 Home 等）で必要時に作る。
 */

import type { Role } from "@/lib/auth/roles";
import { hasMinRole } from "@/lib/auth/roles";

// ── ワークスコープ ──

export const WORK_SCOPES = ["self", "store", "all_stores"] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];

export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  self: "自分",
  store: "店舗",
  all_stores: "全店舗",
};

/**
 * ロールに応じた使用可能なスコープを返す。
 *
 * - owner/admin: 全3段階
 * - staff: self, store
 * - viewer: self のみ
 *
 * ponytail: 既存の hasMinRole を再利用。多店舗テナントでない場合、
 * all_stores は表示しても実質 store と同じ（1 店舗しかない）。
 * フィルタリングは呼び出し側の責任。
 */
export function availableScopes(role: Role): readonly WorkScope[] {
  if (hasMinRole(role, "admin")) return WORK_SCOPES;
  if (hasMinRole(role, "staff")) return ["self", "store"] as const;
  return ["self"] as const;
}

/** ロールのデフォルトスコープ。admin+ は store、それ以外は self。 */
export function defaultScope(role: Role): WorkScope {
  return hasMinRole(role, "admin") ? "store" : "self";
}
