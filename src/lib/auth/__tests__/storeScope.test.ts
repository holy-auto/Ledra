import { describe, it, expect } from "vitest";
import {
  STORE_MEMBERSHIP_ROLES,
  bypassesStoreScope,
  hasStoreAccess,
  effectiveStoreRole,
  isStoreManager,
  accessibleStoreIds,
  type ScopedContext,
} from "../storeScope";
import type { Role } from "../roles";

function makeCtx(role: Role, assignments: { storeId: string; role: "manager" | "staff" }[] = []): ScopedContext {
  return {
    userId: "user-1",
    tenantId: "tenant-1",
    role,
    storeAssignments: assignments,
  };
}

describe("STORE_MEMBERSHIP_ROLES", () => {
  it("matches DB CHECK constraint values", () => {
    expect(STORE_MEMBERSHIP_ROLES).toEqual(["manager", "staff"]);
  });
});

describe("bypassesStoreScope()", () => {
  it.each<[Role, boolean]>([
    ["super_admin", true],
    ["owner", true],
    ["admin", true],
    ["staff", false],
    ["viewer", false],
  ])("%s → %s", (role, expected) => {
    expect(bypassesStoreScope(role)).toBe(expected);
  });
});

describe("hasStoreAccess()", () => {
  it("admin+ always has access regardless of assignments", () => {
    const ctx = makeCtx("admin", []); // no store assignments
    expect(hasStoreAccess(ctx, "store-A")).toBe(true);
  });

  it("staff with assignment has access", () => {
    const ctx = makeCtx("staff", [{ storeId: "store-A", role: "staff" }]);
    expect(hasStoreAccess(ctx, "store-A")).toBe(true);
  });

  it("staff without assignment has no access", () => {
    const ctx = makeCtx("staff", [{ storeId: "store-A", role: "staff" }]);
    expect(hasStoreAccess(ctx, "store-B")).toBe(false);
  });

  it("staff with no assignments has no access to any store", () => {
    const ctx = makeCtx("staff", []);
    expect(hasStoreAccess(ctx, "store-A")).toBe(false);
  });

  it("viewer with assignment has access", () => {
    const ctx = makeCtx("viewer", [{ storeId: "store-X", role: "staff" }]);
    expect(hasStoreAccess(ctx, "store-X")).toBe(true);
  });
});

describe("effectiveStoreRole()", () => {
  it("admin+ is always manager", () => {
    expect(effectiveStoreRole(makeCtx("owner", []), "any-store")).toBe("manager");
  });

  it("staff assigned as manager returns manager", () => {
    const ctx = makeCtx("staff", [{ storeId: "s1", role: "manager" }]);
    expect(effectiveStoreRole(ctx, "s1")).toBe("manager");
  });

  it("staff assigned as staff returns staff", () => {
    const ctx = makeCtx("staff", [{ storeId: "s1", role: "staff" }]);
    expect(effectiveStoreRole(ctx, "s1")).toBe("staff");
  });

  it("staff not assigned returns null", () => {
    const ctx = makeCtx("staff", [{ storeId: "s1", role: "staff" }]);
    expect(effectiveStoreRole(ctx, "s2")).toBeNull();
  });
});

describe("isStoreManager()", () => {
  it("admin+ is manager of any store", () => {
    expect(isStoreManager(makeCtx("admin"), "any")).toBe(true);
  });

  it("staff manager of assigned store", () => {
    const ctx = makeCtx("staff", [{ storeId: "s1", role: "manager" }]);
    expect(isStoreManager(ctx, "s1")).toBe(true);
  });

  it("staff member is not manager", () => {
    const ctx = makeCtx("staff", [{ storeId: "s1", role: "staff" }]);
    expect(isStoreManager(ctx, "s1")).toBe(false);
  });
});

describe("accessibleStoreIds()", () => {
  it("admin+ returns null (all stores)", () => {
    expect(accessibleStoreIds(makeCtx("admin"))).toBeNull();
    expect(accessibleStoreIds(makeCtx("owner"))).toBeNull();
    expect(accessibleStoreIds(makeCtx("super_admin"))).toBeNull();
  });

  it("staff returns assigned store IDs", () => {
    const ctx = makeCtx("staff", [
      { storeId: "s1", role: "manager" },
      { storeId: "s2", role: "staff" },
    ]);
    expect(accessibleStoreIds(ctx)).toEqual(["s1", "s2"]);
  });

  it("staff with no assignments returns empty array", () => {
    expect(accessibleStoreIds(makeCtx("staff"))).toEqual([]);
  });

  it("viewer returns assigned store IDs", () => {
    const ctx = makeCtx("viewer", [{ storeId: "s1", role: "staff" }]);
    expect(accessibleStoreIds(ctx)).toEqual(["s1"]);
  });
});
