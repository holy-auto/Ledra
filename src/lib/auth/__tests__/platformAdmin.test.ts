import { afterEach, describe, expect, it } from "vitest";
import { isPlatformAdmin } from "../platformAdmin";
import type { CallerInfo } from "../checkRole";

function caller(tenantId: string, role: CallerInfo["role"]): CallerInfo {
  return { userId: "u1", tenantId, role, planTier: "pro" };
}

describe("isPlatformAdmin", () => {
  const previous = process.env.PLATFORM_TENANT_ID;
  afterEach(() => {
    if (previous === undefined) delete process.env.PLATFORM_TENANT_ID;
    else process.env.PLATFORM_TENANT_ID = previous;
  });

  it("rejects super_admin outside the platform tenant", () => {
    process.env.PLATFORM_TENANT_ID = "platform";
    expect(isPlatformAdmin(caller("customer-tenant", "super_admin"))).toBe(false);
  });

  it.each(["super_admin", "owner", "admin"] as const)("accepts platform tenant %s", (role) => {
    process.env.PLATFORM_TENANT_ID = "platform";
    expect(isPlatformAdmin(caller("platform", role))).toBe(true);
  });
});
