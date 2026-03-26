import { describe, it, expect } from "vitest";
import { hasPermission, getPermissions, requiredPermissionForPath, type Permission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";

describe("hasPermission", () => {
  describe("viewer role", () => {
    const viewerAllowed: Permission[] = [
      "dashboard:view",
      "certificates:view",
      "vehicles:view",
      "customers:view",
      "reservations:view",
      "invoices:view",
      "market:view",
      "orders:view",
      "stores:view",
      "registers:view",
      "register_sessions:view",
      "payments:view",
      "announcements:view",
      "news:view",
      "price_stats:view",
      "template_options:view",
    ];

    it.each(viewerAllowed)("viewer CAN %s", (perm) => {
      expect(hasPermission("viewer", perm)).toBe(true);
    });

    const viewerDenied: Permission[] = [
      "certificates:create",
      "certificates:edit",
      "certificates:void",
      "vehicles:create",
      "vehicles:edit",
      "vehicles:delete",
      "customers:create",
      "customers:edit",
      "reservations:create",
      "reservations:edit",
      "invoices:create",
      "invoices:edit",
      "market:create",
      "market:edit",
      "orders:create",
      "templates:manage",
      "menu_items:manage",
      "members:view",
      "members:manage",
      "settings:view",
      "settings:edit",
      "billing:view",
      "billing:manage",
      "stores:manage",
      "registers:manage",
      "register_sessions:operate",
      "register_sessions:manage",
      "payments:create",
      "payments:manage",
      "template_options:manage",
      "insurers:view",
      "insurers:manage",
      "management:view",
      "audit:view",
      "logo:manage",
      "platform:manage",
    ];

    it.each(viewerDenied)("viewer CANNOT %s", (perm) => {
      expect(hasPermission("viewer", perm)).toBe(false);
    });
  });

  describe("staff role", () => {
    const staffAllowed: Permission[] = [
      "dashboard:view",
      "certificates:view",
      "certificates:create",
      "certificates:edit",
      "vehicles:view",
      "vehicles:create",
      "vehicles:edit",
      "customers:view",
      "customers:create",
      "customers:edit",
      "reservations:view",
      "reservations:create",
      "reservations:edit",
      "invoices:view",
      "market:view",
      "market:create",
      "market:edit",
      "orders:view",
      "orders:create",
      "stores:view",
      "registers:view",
      "register_sessions:view",
      "register_sessions:operate",
      "payments:view",
      "payments:create",
      "announcements:view",
      "news:view",
      "price_stats:view",
      "template_options:view",
    ];

    it.each(staffAllowed)("staff CAN %s", (perm) => {
      expect(hasPermission("staff", perm)).toBe(true);
    });

    const staffDenied: Permission[] = [
      "certificates:void",
      "vehicles:delete",
      "invoices:create",
      "invoices:edit",
      "templates:manage",
      "menu_items:manage",
      "members:view",
      "members:manage",
      "settings:view",
      "settings:edit",
      "billing:view",
      "billing:manage",
      "stores:manage",
      "registers:manage",
      "register_sessions:manage",
      "payments:manage",
      "template_options:manage",
      "insurers:view",
      "insurers:manage",
      "management:view",
      "audit:view",
      "logo:manage",
      "platform:manage",
    ];

    it.each(staffDenied)("staff CANNOT %s", (perm) => {
      expect(hasPermission("staff", perm)).toBe(false);
    });
  });

  describe("admin role", () => {
    it("admin CAN manage members", () => {
      expect(hasPermission("admin", "members:manage")).toBe(true);
    });
    it("admin CAN edit settings", () => {
      expect(hasPermission("admin", "settings:edit")).toBe(true);
    });
    it("admin CAN void certificates", () => {
      expect(hasPermission("admin", "certificates:void")).toBe(true);
    });
    it("admin CAN delete vehicles", () => {
      expect(hasPermission("admin", "vehicles:delete")).toBe(true);
    });
    it("admin CAN manage stores", () => {
      expect(hasPermission("admin", "stores:manage")).toBe(true);
    });
    it("admin CAN view billing", () => {
      expect(hasPermission("admin", "billing:view")).toBe(true);
    });
    it("admin CANNOT manage billing", () => {
      expect(hasPermission("admin", "billing:manage")).toBe(false);
    });
    it("admin CANNOT manage platform", () => {
      expect(hasPermission("admin", "platform:manage")).toBe(false);
    });
  });

  describe("owner role", () => {
    it("owner CAN manage billing", () => {
      expect(hasPermission("owner", "billing:manage")).toBe(true);
    });
    it("owner CAN manage members", () => {
      expect(hasPermission("owner", "members:manage")).toBe(true);
    });
    it("owner CAN manage stores", () => {
      expect(hasPermission("owner", "stores:manage")).toBe(true);
    });
    it("owner CAN void certificates", () => {
      expect(hasPermission("owner", "certificates:void")).toBe(true);
    });
    it("owner CANNOT manage platform", () => {
      expect(hasPermission("owner", "platform:manage")).toBe(false);
    });
  });

  describe("super_admin role", () => {
    it("super_admin CAN manage platform", () => {
      expect(hasPermission("super_admin", "platform:manage")).toBe(true);
    });
    it("super_admin CAN manage billing", () => {
      expect(hasPermission("super_admin", "billing:manage")).toBe(true);
    });
    it("super_admin CAN void certificates", () => {
      expect(hasPermission("super_admin", "certificates:void")).toBe(true);
    });
  });
});

describe("getPermissions", () => {
  it("returns a Set of permissions for a role", () => {
    const perms = getPermissions("viewer");
    expect(perms).toBeInstanceOf(Set);
    expect(perms.has("dashboard:view")).toBe(true);
    expect(perms.has("platform:manage")).toBe(false);
  });

  it("super_admin has strictly more permissions than owner", () => {
    const superPerms = getPermissions("super_admin");
    const ownerPerms = getPermissions("owner");
    for (const p of ownerPerms) {
      expect(superPerms.has(p)).toBe(true);
    }
    expect(superPerms.has("platform:manage")).toBe(true);
    expect(ownerPerms.has("platform:manage")).toBe(false);
  });

  it("owner has strictly more permissions than admin", () => {
    const ownerPerms = getPermissions("owner");
    const adminPerms = getPermissions("admin");
    for (const p of adminPerms) {
      expect(ownerPerms.has(p)).toBe(true);
    }
    expect(ownerPerms.has("billing:manage")).toBe(true);
    expect(adminPerms.has("billing:manage")).toBe(false);
  });
});

describe("requiredPermissionForPath", () => {
  it("returns exact match for known routes", () => {
    expect(requiredPermissionForPath("/admin")).toBe("dashboard:view");
    expect(requiredPermissionForPath("/admin/certificates")).toBe("certificates:view");
    expect(requiredPermissionForPath("/admin/members")).toBe("members:view");
  });

  it("returns prefix match for sub-routes", () => {
    expect(requiredPermissionForPath("/admin/certificates/abc-123")).toBe("certificates:view");
    expect(requiredPermissionForPath("/admin/members/invite")).toBe("members:view");
  });

  it("returns prefix match for /new paths (prefix takes priority)", () => {
    // The prefix match for /admin/certificates fires before the /new special case
    expect(requiredPermissionForPath("/admin/certificates/new")).toBe("certificates:view");
  });

  it("returns null for unknown paths", () => {
    expect(requiredPermissionForPath("/unknown/route")).toBeNull();
  });
});
