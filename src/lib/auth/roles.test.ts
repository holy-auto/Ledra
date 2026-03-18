import { describe, it, expect } from "vitest";
import { normalizeRole, hasMinRole, ROLES, ASSIGNABLE_ROLES, type Role } from "./roles";

// ─── normalizeRole ───
describe("normalizeRole", () => {
  it("正常なロール文字列をそのまま返す", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("staff")).toBe("staff");
    expect(normalizeRole("viewer")).toBe("viewer");
  });

  it("大文字・混合ケースを正規化する", () => {
    expect(normalizeRole("OWNER")).toBe("owner");
    expect(normalizeRole("Admin")).toBe("admin");
    expect(normalizeRole("STAFF")).toBe("staff");
    expect(normalizeRole("Viewer")).toBe("viewer");
  });

  it("不正な値はadminにフォールバック", () => {
    expect(normalizeRole("")).toBe("admin");
    expect(normalizeRole(null)).toBe("admin");
    expect(normalizeRole(undefined)).toBe("admin");
    expect(normalizeRole("superadmin")).toBe("admin");
    expect(normalizeRole(123)).toBe("admin");
  });
});

// ─── hasMinRole ───
describe("hasMinRole", () => {
  it("ownerは全てのロール要件を満たす", () => {
    expect(hasMinRole("owner", "owner")).toBe(true);
    expect(hasMinRole("owner", "admin")).toBe(true);
    expect(hasMinRole("owner", "staff")).toBe(true);
    expect(hasMinRole("owner", "viewer")).toBe(true);
  });

  it("adminはadmin以下を満たす", () => {
    expect(hasMinRole("admin", "owner")).toBe(false);
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("admin", "staff")).toBe(true);
    expect(hasMinRole("admin", "viewer")).toBe(true);
  });

  it("staffはstaff以下を満たす", () => {
    expect(hasMinRole("staff", "owner")).toBe(false);
    expect(hasMinRole("staff", "admin")).toBe(false);
    expect(hasMinRole("staff", "staff")).toBe(true);
    expect(hasMinRole("staff", "viewer")).toBe(true);
  });

  it("viewerはviewerのみ満たす", () => {
    expect(hasMinRole("viewer", "owner")).toBe(false);
    expect(hasMinRole("viewer", "admin")).toBe(false);
    expect(hasMinRole("viewer", "staff")).toBe(false);
    expect(hasMinRole("viewer", "viewer")).toBe(true);
  });
});

// ─── 定数の整合性 ───
describe("ロール定数", () => {
  it("ROLESは4種類", () => {
    expect(ROLES).toHaveLength(4);
    expect(ROLES).toContain("owner");
    expect(ROLES).toContain("admin");
    expect(ROLES).toContain("staff");
    expect(ROLES).toContain("viewer");
  });

  it("ASSIGNABLE_ROLESにownerは含まれない", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
    expect(ASSIGNABLE_ROLES).toHaveLength(3);
  });
});
