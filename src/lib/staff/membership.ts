/**
 * IMP-045: スタッフメンバーシップ管理 — 移籍・停止・最終管理者保護。
 *
 * 既存インフラ:
 * - tenant_memberships (role: super_admin/owner/admin/staff/viewer)
 * - store_memberships (role: manager/staff)
 * - memberLimits.ts (プラン別上限)
 * - invite.ts (招待フロー)
 *
 * 本モジュールはアプリ層の純粋ガード関数を提供する。
 * API ルートは個別に is_self / role 検証をしているが、
 * ロジックが散在してテスト困難。ここに集約する。
 *
 * ponytail: 型と純関数のみ。IO なし。
 */

import type { Role } from "@/lib/auth/roles";
import { hasMinRole, ASSIGNABLE_ROLES } from "@/lib/auth/roles";
import type { StoreAssignment } from "@/lib/auth/storeScope";

// ── メンバーシップ状態 ──

/**
 * ponytail: MembershipState は認証/アイデンティティの状態であり、
 * states.ts のドメイン状態語彙（Job/Step/Severity/Certificate/Payment/Sync）とは
 * 別軸。tenant_memberships の運用状態を表し、ドメインオブジェクトの
 * ライフサイクルとは無関係なので states.ts には登録しない。
 */
export const MEMBERSHIP_STATES = ["active", "suspended", "deactivated"] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

// ── ロール変更ガード ──

export type RoleChangeInput = {
  /** 変更操作者のロール */
  callerRole: Role;
  /** 操作者自身の userId */
  callerId: string;
  /** 対象メンバーの userId */
  targetId: string;
  /** 対象メンバーの現在のロール */
  currentRole: Role;
  /** 変更先のロール */
  newRole: Role;
  /**
   * テナント内の admin 以上のメンバー数（対象者を含む）。
   * admin→staff/viewer への降格時に最終管理者保護で使用。
   */
  adminOrAboveCount: number;
};

export type RoleChangeResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "self_change" | "insufficient_rank" | "unassignable_role" | "owner_protected" | "last_admin";
    };

/**
 * ロール変更が許可されるかを判定する。
 *
 * ルール（チェック順は validateMemberRemoval / validateMemberSuspension と統一 —
 * 権限不足を先に判定することで、権限のない操作者に対象の役職を明かさない）:
 * 1. 自分自身のロールは変更不可（管理者不在を防ぐ）
 * 2. 操作者は admin 以上が必要
 * 3. owner のロールは変更不可（owner は特殊。移譲は別フロー）
 * 4. 変更先は ASSIGNABLE_ROLES (admin/staff/viewer) のみ
 * 5. admin 以上 → staff/viewer への降格時、最後の admin なら拒否
 */
export function validateRoleChange(input: RoleChangeInput): RoleChangeResult {
  if (input.callerId === input.targetId) {
    return { allowed: false, reason: "self_change" };
  }
  if (!hasMinRole(input.callerRole, "admin")) {
    return { allowed: false, reason: "insufficient_rank" };
  }
  if (input.currentRole === "owner" || input.currentRole === "super_admin") {
    return { allowed: false, reason: "owner_protected" };
  }
  if (!ASSIGNABLE_ROLES.includes(input.newRole)) {
    return { allowed: false, reason: "unassignable_role" };
  }
  // admin→staff/viewer 降格で admin 以上が 0 になるケースを防ぐ
  // （wouldLoseLastAdmin は currentRole が admin 以上か・残数が1以下かを判定。
  //   ここでは「実際に admin 未満へ降格するか」も併せて見る必要がある）
  if (!hasMinRole(input.newRole, "admin") && wouldLoseLastAdmin(input.currentRole, input.adminOrAboveCount)) {
    return { allowed: false, reason: "last_admin" };
  }
  return { allowed: true };
}

// ── メンバー削除ガード（最終管理者保護） ──

export type MemberRemovalInput = {
  callerRole: Role;
  callerId: string;
  targetId: string;
  targetRole: Role;
  /**
   * テナント内の admin 以上のロールを持つメンバー数（対象者を含む）。
   * admin + owner + super_admin の合計。
   */
  adminOrAboveCount: number;
};

export type MemberRemovalResult =
  | { allowed: true }
  | { allowed: false; reason: "self_removal" | "insufficient_rank" | "last_admin" | "owner_protected" };

/**
 * メンバー削除が許可されるかを判定する。
 *
 * ルール:
 * 1. 自分自身の削除は不可（退会フローは別）
 * 2. admin 以上が必要
 * 3. owner の削除は不可（owner はテナントの生命線）
 * 4. 唯一の owner は削除不可
 * 5. 唯一の admin 以上は削除不可（管理者不在を防ぐ）
 */
export function validateMemberRemoval(input: MemberRemovalInput): MemberRemovalResult {
  if (input.callerId === input.targetId) {
    return { allowed: false, reason: "self_removal" };
  }
  if (!hasMinRole(input.callerRole, "admin")) {
    return { allowed: false, reason: "insufficient_rank" };
  }
  if (input.targetRole === "owner" || input.targetRole === "super_admin") {
    return { allowed: false, reason: "owner_protected" };
  }
  // admin 削除時、残り admin が 0 になるケースを防ぐ。
  // owner は admin 以上なので adminOrAboveCount に含まれる。
  if (wouldLoseLastAdmin(input.targetRole, input.adminOrAboveCount)) {
    return { allowed: false, reason: "last_admin" };
  }
  return { allowed: true };
}

// ── 停止（サスペンド）／無効化 ──

export type MemberSuspensionInput = {
  callerRole: Role;
  callerId: string;
  targetId: string;
  targetRole: Role;
  /** 操作種別。suspend = 一時停止（復帰可）、deactivate = 無効化（復帰は admin 操作） */
  action: "suspend" | "deactivate";
  /**
   * テナント内の admin 以上のメンバー数（対象者を含む）。
   */
  adminOrAboveCount: number;
};

export type MemberSuspensionResult =
  | { allowed: true; newState: MembershipState }
  | { allowed: false; reason: "self_suspension" | "insufficient_rank" | "owner_protected" | "last_admin" };

/**
 * メンバーの停止/無効化が許可されるかを判定する。
 *
 * ルール:
 * 1. 自分自身は不可（管理者不在防止）
 * 2. admin 以上が必要
 * 3. owner/super_admin は停止不可
 * 4. 最後の admin は停止不可
 */
export function validateMemberSuspension(input: MemberSuspensionInput): MemberSuspensionResult {
  if (input.callerId === input.targetId) {
    return { allowed: false, reason: "self_suspension" };
  }
  if (!hasMinRole(input.callerRole, "admin")) {
    return { allowed: false, reason: "insufficient_rank" };
  }
  if (input.targetRole === "owner" || input.targetRole === "super_admin") {
    return { allowed: false, reason: "owner_protected" };
  }
  if (wouldLoseLastAdmin(input.targetRole, input.adminOrAboveCount)) {
    return { allowed: false, reason: "last_admin" };
  }
  return { allowed: true, newState: input.action === "suspend" ? "suspended" : "deactivated" };
}

// ── 店舗間移籍 ──

export type StoreTransferInput = {
  callerRole: Role;
  /** 対象メンバーの現在の店舗割当一覧 */
  currentAssignments: readonly StoreAssignment[];
  /** 移籍元の店舗 ID */
  fromStoreId: string;
  /** 移籍先の店舗 ID */
  toStoreId: string;
  /** 移籍先での役割（省略時は移籍元の役割を引き継ぐ） */
  newRole?: "manager" | "staff";
};

export type StoreTransferResult =
  | { allowed: true; effectiveRole: "manager" | "staff" }
  | { allowed: false; reason: "insufficient_rank" | "same_store" | "not_assigned" | "already_assigned" };

/**
 * 店舗間移籍が許可されるかを判定する。
 *
 * 移籍 = fromStore の割当を解除し toStore に割当。
 * 呼び出し側が DB 操作を行う（delete → insert）。
 *
 * ルール:
 * 1. admin 以上が必要（stores:manage 権限相当）
 * 2. 同一店舗への移籍は不可
 * 3. 移籍元に割当がない場合は不可
 */
export function validateStoreTransfer(input: StoreTransferInput): StoreTransferResult {
  if (!hasMinRole(input.callerRole, "admin")) {
    return { allowed: false, reason: "insufficient_rank" };
  }
  if (input.fromStoreId === input.toStoreId) {
    return { allowed: false, reason: "same_store" };
  }
  // ponytail: 移籍先に既に割当がある場合は重複防止
  if (input.currentAssignments.some((a) => a.storeId === input.toStoreId)) {
    return { allowed: false, reason: "already_assigned" };
  }
  const fromAssignment = input.currentAssignments.find((a) => a.storeId === input.fromStoreId);
  if (!fromAssignment) {
    return { allowed: false, reason: "not_assigned" };
  }
  return { allowed: true, effectiveRole: input.newRole ?? fromAssignment.role };
}

// ── 唯一の owner/admin チェック（汎用） ──

/**
 * テナントの最終管理者（admin 以上が全員消えるケース）を防ぐ汎用ガード。
 *
 * validateMemberRemoval() / validateMemberSuspension() / validateRoleChange() が
 * 内部で使う単一定義源。バッチ操作等で呼び出し側が直接使いたいケースのためにも公開する。
 * 「対象者が admin 以上で、かつ残り admin 以上が 1 名以下」なら true。
 */
export function wouldLoseLastAdmin(targetRole: Role, adminOrAboveCount: number): boolean {
  return hasMinRole(targetRole, "admin") && adminOrAboveCount <= 1;
}
