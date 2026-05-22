import { describe, expect, it } from "vitest";
import { computePerTenantSplit, generateLeadToken, isLeadTokenFormat } from "@/lib/marketplace/leads";

describe("generateLeadToken / isLeadTokenFormat", () => {
  it("starts with lrf_ and is long enough", () => {
    const t = generateLeadToken();
    expect(t.startsWith("lrf_")).toBe(true);
    expect(isLeadTokenFormat(t)).toBe(true);
  });
  it("rejects malformed tokens", () => {
    expect(isLeadTokenFormat("lpt_abc123")).toBe(false); // wrong prefix
    expect(isLeadTokenFormat("lrf_short")).toBe(false);
    expect(isLeadTokenFormat("")).toBe(false);
    expect(isLeadTokenFormat("not a token at all")).toBe(false);
  });
  it("yields different tokens each call", () => {
    expect(generateLeadToken()).not.toBe(generateLeadToken());
  });
});

describe("computePerTenantSplit", () => {
  it("returns empty when no tenants", () => {
    expect(computePerTenantSplit(1000, [])).toEqual({});
  });
  it("returns empty when fee is 0", () => {
    expect(computePerTenantSplit(0, ["t1", "t2"])).toEqual({});
  });
  it("splits evenly across tenants", () => {
    const r = computePerTenantSplit(1000, ["t1", "t2", "t3"]);
    expect(r.t1 + r.t2 + r.t3).toBe(1000);
    expect(r.t1).toBe(333);
    expect(r.t2).toBe(333);
    expect(r.t3).toBe(334); // remainder rolls to last
  });
  it("preserves exact total even with awkward fees", () => {
    const r = computePerTenantSplit(5_002, ["a", "b", "c"]);
    const total = Object.values(r).reduce((s, v) => s + v, 0);
    expect(total).toBe(5_002);
  });
  it("gives the full fee to a single attributed tenant", () => {
    const r = computePerTenantSplit(5_000, ["sole"]);
    expect(r).toEqual({ sole: 5_000 });
  });
});
