import { describe, it, expect } from "vitest";
import {
  validateRoleChange,
  validateMemberRemoval,
  validateMemberSuspension,
  validateStoreTransfer,
  wouldLoseLastAdmin,
  type RoleChangeInput,
  type MemberRemovalInput,
  type MemberSuspensionInput,
  type StoreTransferInput,
} from "../membership";

// ── ヘルパ ──

const mkRoleChange = (overrides?: Partial<RoleChangeInput>): RoleChangeInput => ({
  callerRole: "owner",
  callerId: "caller-1",
  targetId: "target-1",
  currentRole: "staff",
  newRole: "admin",
  adminOrAboveCount: 2,
  ...overrides,
});

const mkRemoval = (overrides?: Partial<MemberRemovalInput>): MemberRemovalInput => ({
  callerRole: "owner",
  callerId: "caller-1",
  targetId: "target-1",
  targetRole: "staff",
  adminOrAboveCount: 2,
  ...overrides,
});

const mkSuspension = (overrides?: Partial<MemberSuspensionInput>): MemberSuspensionInput => ({
  callerRole: "admin",
  callerId: "caller-1",
  targetId: "target-1",
  targetRole: "staff",
  action: "suspend",
  adminOrAboveCount: 2,
  ...overrides,
});

const mkTransfer = (overrides?: Partial<StoreTransferInput>): StoreTransferInput => ({
  callerRole: "admin",
  currentAssignments: [{ storeId: "store-a", role: "staff" }],
  fromStoreId: "store-a",
  toStoreId: "store-b",
  ...overrides,
});

// ── validateRoleChange ──

describe("validateRoleChange", () => {
  it("正常: admin が staff → admin に変更", () => {
    const result = validateRoleChange(mkRoleChange({ callerRole: "admin" }));
    expect(result.allowed).toBe(true);
  });

  it("自分自身のロール変更は不可", () => {
    const result = validateRoleChange(mkRoleChange({ callerId: "u1", targetId: "u1" }));
    expect(result).toEqual({ allowed: false, reason: "self_change" });
  });

  it("owner のロールは変更不可", () => {
    const result = validateRoleChange(mkRoleChange({ currentRole: "owner" }));
    expect(result).toEqual({ allowed: false, reason: "owner_protected" });
  });

  it("super_admin のロールは変更不可", () => {
    const result = validateRoleChange(mkRoleChange({ currentRole: "super_admin" }));
    expect(result).toEqual({ allowed: false, reason: "owner_protected" });
  });

  it("staff 権限では変更不可", () => {
    const result = validateRoleChange(mkRoleChange({ callerRole: "staff" }));
    expect(result).toEqual({ allowed: false, reason: "insufficient_rank" });
  });

  it("viewer 権限では変更不可", () => {
    const result = validateRoleChange(mkRoleChange({ callerRole: "viewer" }));
    expect(result).toEqual({ allowed: false, reason: "insufficient_rank" });
  });

  it("owner への昇格は不可（ASSIGNABLE_ROLES 外）", () => {
    const result = validateRoleChange(mkRoleChange({ newRole: "owner" }));
    expect(result).toEqual({ allowed: false, reason: "unassignable_role" });
  });

  it("権限不足の操作者が owner を対象にした場合、insufficient_rank を返す（owner_protected で対象の役職を漏らさない）", () => {
    // validateMemberRemoval / validateMemberSuspension と同じチェック順に統一
    const result = validateRoleChange(mkRoleChange({ callerRole: "staff", currentRole: "owner" }));
    expect(result).toEqual({ allowed: false, reason: "insufficient_rank" });
  });

  it("super_admin への昇格は不可", () => {
    const result = validateRoleChange(mkRoleChange({ newRole: "super_admin" }));
    expect(result).toEqual({ allowed: false, reason: "unassignable_role" });
  });

  it("admin → viewer への降格は許可", () => {
    const result = validateRoleChange(mkRoleChange({ currentRole: "admin", newRole: "viewer", adminOrAboveCount: 2 }));
    expect(result.allowed).toBe(true);
  });

  it("最後の admin の降格は不可", () => {
    const result = validateRoleChange(mkRoleChange({ currentRole: "admin", newRole: "staff", adminOrAboveCount: 1 }));
    expect(result).toEqual({ allowed: false, reason: "last_admin" });
  });

  it("admin が複数いれば降格は許可", () => {
    const result = validateRoleChange(mkRoleChange({ currentRole: "admin", newRole: "viewer", adminOrAboveCount: 3 }));
    expect(result.allowed).toBe(true);
  });
});

// ── validateMemberRemoval ──

describe("validateMemberRemoval", () => {
  it("正常: owner が staff を削除", () => {
    const result = validateMemberRemoval(mkRemoval());
    expect(result.allowed).toBe(true);
  });

  it("自分自身の削除は不可", () => {
    const result = validateMemberRemoval(mkRemoval({ callerId: "u1", targetId: "u1" }));
    expect(result).toEqual({ allowed: false, reason: "self_removal" });
  });

  it("staff 権限では削除不可", () => {
    const result = validateMemberRemoval(mkRemoval({ callerRole: "staff" }));
    expect(result).toEqual({ allowed: false, reason: "insufficient_rank" });
  });

  it("owner の削除は不可", () => {
    const result = validateMemberRemoval(mkRemoval({ targetRole: "owner" }));
    expect(result).toEqual({ allowed: false, reason: "owner_protected" });
  });

  it("最後の admin の削除は不可", () => {
    const result = validateMemberRemoval(mkRemoval({ targetRole: "admin", adminOrAboveCount: 1 }));
    expect(result).toEqual({ allowed: false, reason: "last_admin" });
  });

  it("admin が複数いれば admin 削除は許可", () => {
    const result = validateMemberRemoval(mkRemoval({ targetRole: "admin", adminOrAboveCount: 3 }));
    expect(result.allowed).toBe(true);
  });

  it("staff/viewer の削除は adminOrAboveCount に影響しない", () => {
    const result = validateMemberRemoval(mkRemoval({ targetRole: "viewer", adminOrAboveCount: 1 }));
    expect(result.allowed).toBe(true);
  });
});

// ── validateMemberSuspension ──

describe("validateMemberSuspension", () => {
  it("正常: suspend → newState = 'suspended'", () => {
    const result = validateMemberSuspension(mkSuspension({ action: "suspend" }));
    expect(result).toEqual({ allowed: true, newState: "suspended" });
  });

  it("正常: deactivate → newState = 'deactivated'", () => {
    const result = validateMemberSuspension(mkSuspension({ action: "deactivate" }));
    expect(result).toEqual({ allowed: true, newState: "deactivated" });
  });

  it("自分自身は停止不可", () => {
    const result = validateMemberSuspension(mkSuspension({ callerId: "u1", targetId: "u1" }));
    expect(result).toEqual({ allowed: false, reason: "self_suspension" });
  });

  it("staff 権限では停止不可", () => {
    const result = validateMemberSuspension(mkSuspension({ callerRole: "staff" }));
    expect(result).toEqual({ allowed: false, reason: "insufficient_rank" });
  });

  it("owner の停止は不可", () => {
    const result = validateMemberSuspension(mkSuspension({ targetRole: "owner" }));
    expect(result).toEqual({ allowed: false, reason: "owner_protected" });
  });

  it("最後の admin の停止は不可", () => {
    const result = validateMemberSuspension(mkSuspension({ targetRole: "admin", adminOrAboveCount: 1 }));
    expect(result).toEqual({ allowed: false, reason: "last_admin" });
  });
});

// ── validateStoreTransfer ──

describe("validateStoreTransfer", () => {
  it("正常: 元の role を引き継ぐ", () => {
    const result = validateStoreTransfer(mkTransfer());
    expect(result).toEqual({ allowed: true, effectiveRole: "staff" });
  });

  it("正常: 新しい role を指定", () => {
    const result = validateStoreTransfer(mkTransfer({ newRole: "manager" }));
    expect(result).toEqual({ allowed: true, effectiveRole: "manager" });
  });

  it("staff 権限では移籍不可", () => {
    const result = validateStoreTransfer(mkTransfer({ callerRole: "staff" }));
    expect(result).toEqual({ allowed: false, reason: "insufficient_rank" });
  });

  it("同一店舗への移籍は不可", () => {
    const result = validateStoreTransfer(mkTransfer({ fromStoreId: "s1", toStoreId: "s1" }));
    expect(result).toEqual({ allowed: false, reason: "same_store" });
  });

  it("移籍元に割当がなければ不可", () => {
    const result = validateStoreTransfer(
      mkTransfer({ fromStoreId: "store-x", currentAssignments: [{ storeId: "store-a", role: "staff" }] }),
    );
    expect(result).toEqual({ allowed: false, reason: "not_assigned" });
  });

  it("移籍先に既に割当がある場合は不可", () => {
    const result = validateStoreTransfer(
      mkTransfer({
        currentAssignments: [
          { storeId: "store-a", role: "staff" },
          { storeId: "store-b", role: "staff" },
        ],
      }),
    );
    expect(result).toEqual({ allowed: false, reason: "already_assigned" });
  });

  it("manager からの移籍は role を引き継ぐ", () => {
    const result = validateStoreTransfer(mkTransfer({ currentAssignments: [{ storeId: "store-a", role: "manager" }] }));
    expect(result).toEqual({ allowed: true, effectiveRole: "manager" });
  });
});

// ── wouldLoseLastAdmin ──

describe("wouldLoseLastAdmin", () => {
  it("admin が最後の 1 人 → true", () => {
    expect(wouldLoseLastAdmin("admin", 1)).toBe(true);
  });

  it("owner が最後の 1 人 → true（owner は admin 以上）", () => {
    expect(wouldLoseLastAdmin("owner", 1)).toBe(true);
  });

  it("admin が 2 人以上 → false", () => {
    expect(wouldLoseLastAdmin("admin", 2)).toBe(false);
  });

  it("staff → false（admin 以上ではない）", () => {
    expect(wouldLoseLastAdmin("staff", 1)).toBe(false);
  });

  it("viewer → false", () => {
    expect(wouldLoseLastAdmin("viewer", 1)).toBe(false);
  });
});

// ── validateRoleChange / validateMemberRemoval / validateMemberSuspension のチェック順一貫性 ──

describe("3つのガード関数のチェック順一貫性（権限不足を役職保護より先に判定）", () => {
  it("権限不足の操作者が owner を対象にした場合、3関数とも insufficient_rank を返す", () => {
    expect(validateRoleChange(mkRoleChange({ callerRole: "staff", currentRole: "owner" }))).toEqual({
      allowed: false,
      reason: "insufficient_rank",
    });
    expect(validateMemberRemoval(mkRemoval({ callerRole: "staff", targetRole: "owner" }))).toEqual({
      allowed: false,
      reason: "insufficient_rank",
    });
    expect(validateMemberSuspension(mkSuspension({ callerRole: "staff", targetRole: "owner" }))).toEqual({
      allowed: false,
      reason: "insufficient_rank",
    });
  });
});
