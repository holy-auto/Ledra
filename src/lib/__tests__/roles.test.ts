import { describe, it, expect } from "vitest";
import { normalizeRole, hasMinRole, type Role } from "../auth/roles";

describe("normalizeRole", () => {
  it("returns 'owner' for owner input", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("OWNER")).toBe("owner");
  });

  it("returns 'staff' for staff input", () => {
    expect(normalizeRole("staff")).toBe("staff");
    expect(normalizeRole("Staff")).toBe("staff");
  });

  it("returns 'viewer' for viewer input", () => {
    expect(normalizeRole("viewer")).toBe("viewer");
  });

  it("defaults to 'admin' for unrecognized input", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("unknown")).toBe("admin");
    expect(normalizeRole(null)).toBe("admin");
    expect(normalizeRole(undefined)).toBe("admin");
    expect(normalizeRole("")).toBe("admin");
  });
});

describe("hasMinRole", () => {
  it("owner has access to everything", () => {
    expect(hasMinRole("owner", "viewer")).toBe(true);
    expect(hasMinRole("owner", "staff")).toBe(true);
    expect(hasMinRole("owner", "admin")).toBe(true);
    expect(hasMinRole("owner", "owner")).toBe(true);
  });

  it("admin has access to admin and below", () => {
    expect(hasMinRole("admin", "viewer")).toBe(true);
    expect(hasMinRole("admin", "staff")).toBe(true);
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("admin", "owner")).toBe(false);
  });

  it("staff has access to staff and below", () => {
    expect(hasMinRole("staff", "viewer")).toBe(true);
    expect(hasMinRole("staff", "staff")).toBe(true);
    expect(hasMinRole("staff", "admin")).toBe(false);
    expect(hasMinRole("staff", "owner")).toBe(false);
  });

  it("viewer only has viewer access", () => {
    expect(hasMinRole("viewer", "viewer")).toBe(true);
    expect(hasMinRole("viewer", "staff")).toBe(false);
    expect(hasMinRole("viewer", "admin")).toBe(false);
    expect(hasMinRole("viewer", "owner")).toBe(false);
  });
});
