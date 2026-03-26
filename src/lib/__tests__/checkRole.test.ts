import { describe, it, expect } from "vitest";
import { requireMinRole, requirePermission, type CallerInfo } from "@/lib/auth/checkRole";
import type { Role } from "@/lib/auth/roles";

function makeCaller(role: Role): CallerInfo {
  return {
    userId: "test-user-id",
    tenantId: "test-tenant-id",
    role,
  };
}

describe("requireMinRole", () => {
  // Role hierarchy: super_admin(5) > owner(4) > admin(3) > staff(2) > viewer(1)

  it("super_admin meets any requirement", () => {
    expect(requireMinRole(makeCaller("super_admin"), "super_admin")).toBe(true);
    expect(requireMinRole(makeCaller("super_admin"), "owner")).toBe(true);
    expect(requireMinRole(makeCaller("super_admin"), "admin")).toBe(true);
    expect(requireMinRole(makeCaller("super_admin"), "staff")).toBe(true);
    expect(requireMinRole(makeCaller("super_admin"), "viewer")).toBe(true);
  });

  it("owner meets admin requirement", () => {
    expect(requireMinRole(makeCaller("owner"), "admin")).toBe(true);
  });

  it("owner does not meet super_admin requirement", () => {
    expect(requireMinRole(makeCaller("owner"), "super_admin")).toBe(false);
  });

  it("admin meets admin requirement", () => {
    expect(requireMinRole(makeCaller("admin"), "admin")).toBe(true);
  });

  it("admin meets staff requirement", () => {
    expect(requireMinRole(makeCaller("admin"), "staff")).toBe(true);
  });

  it("admin does not meet owner requirement", () => {
    expect(requireMinRole(makeCaller("admin"), "owner")).toBe(false);
  });

  it("staff meets staff requirement", () => {
    expect(requireMinRole(makeCaller("staff"), "staff")).toBe(true);
  });

  it("staff does not meet admin requirement", () => {
    expect(requireMinRole(makeCaller("staff"), "admin")).toBe(false);
  });

  it("viewer meets viewer requirement", () => {
    expect(requireMinRole(makeCaller("viewer"), "viewer")).toBe(true);
  });

  it("viewer does not meet staff requirement", () => {
    expect(requireMinRole(makeCaller("viewer"), "staff")).toBe(false);
  });

  it("viewer does not meet admin requirement", () => {
    expect(requireMinRole(makeCaller("viewer"), "admin")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("admin can void certificates", () => {
    expect(requirePermission(makeCaller("admin"), "certificates:void")).toBe(true);
  });

  it("staff cannot void certificates", () => {
    expect(requirePermission(makeCaller("staff"), "certificates:void")).toBe(false);
  });

  it("viewer cannot create certificates", () => {
    expect(requirePermission(makeCaller("viewer"), "certificates:create")).toBe(false);
  });

  it("staff can create certificates", () => {
    expect(requirePermission(makeCaller("staff"), "certificates:create")).toBe(true);
  });

  it("owner can manage billing", () => {
    expect(requirePermission(makeCaller("owner"), "billing:manage")).toBe(true);
  });

  it("admin cannot manage billing", () => {
    expect(requirePermission(makeCaller("admin"), "billing:manage")).toBe(false);
  });

  it("super_admin can manage platform", () => {
    expect(requirePermission(makeCaller("super_admin"), "platform:manage")).toBe(true);
  });

  it("owner cannot manage platform", () => {
    expect(requirePermission(makeCaller("owner"), "platform:manage")).toBe(false);
  });
});
