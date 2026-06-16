import { describe, it, expect } from "vitest";
import { organizationUserAddSchema, organizationUserRoleSchema } from "../organization";

describe("organizationUserAddSchema", () => {
  it("accepts a valid email and defaults role to org_viewer", () => {
    const r = organizationUserAddSchema.safeParse({ email: "hq@example.com" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("org_viewer");
  });

  it("accepts org_admin", () => {
    const r = organizationUserAddSchema.safeParse({ email: "hq@example.com", role: "org_admin" });
    expect(r.success).toBe(true);
  });

  it("rejects org_owner (not assignable)", () => {
    const r = organizationUserAddSchema.safeParse({ email: "hq@example.com", role: "org_owner" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = organizationUserAddSchema.safeParse({ email: "nope" });
    expect(r.success).toBe(false);
  });
});

describe("organizationUserRoleSchema", () => {
  it("requires a uuid user_id and an assignable role", () => {
    const ok = organizationUserRoleSchema.safeParse({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "org_admin",
    });
    expect(ok.success).toBe(true);

    const badId = organizationUserRoleSchema.safeParse({ user_id: "x", role: "org_admin" });
    expect(badId.success).toBe(false);

    const badRole = organizationUserRoleSchema.safeParse({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "org_owner",
    });
    expect(badRole.success).toBe(false);
  });
});
