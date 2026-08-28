import { describe, expect, it } from "vitest";
import { hashTenantBearerToken } from "../tenantPrivateSecrets";

describe("hashTenantBearerToken", () => {
  it("is deterministic without retaining the bearer token", () => {
    const token = "nex_super-secret-value";
    const hash = hashTenantBearerToken("external_api", token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashTenantBearerToken("external_api", token)).toBe(hash);
  });

  it("domain-separates token types", () => {
    expect(hashTenantBearerToken("external_api", "same")).not.toBe(hashTenantBearerToken("email_inbound", "same"));
  });
});
