import { describe, expect, it, vi } from "vitest";
import {
  checkPassportMonthlyQuota,
  extractBearer,
  generatePassportApiKey,
  hasPassportScope,
  hashPassportApiKey,
  resolvePassportApiKey,
} from "@/lib/passport/api/keys";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

describe("generatePassportApiKey + hashPassportApiKey", () => {
  it("returns a key with the lpk_live_ prefix and matching hash", () => {
    const { rawKey, prefix, keyHash } = generatePassportApiKey();
    expect(rawKey.startsWith("lpk_live_")).toBe(true);
    expect(prefix).toBe(rawKey.slice(0, 12));
    expect(hashPassportApiKey(rawKey)).toBe(keyHash);
  });

  it("does not collide with tenant API keys (different pepper string)", async () => {
    // Even with the same raw bytes, the hash differs because the
    // hashing inputs include distinct version tags.
    const { hashKey: hashTenantKey } = await import("@/lib/tenant-api-keys");
    const fakeRaw = "lpk_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    // hashTenantKey would reject the prefix in practice; we're
    // testing that the digest namespaces differ.
    const passportHash = hashPassportApiKey(fakeRaw);
    const tenantHash = hashTenantKey(fakeRaw);
    expect(passportHash).not.toBe(tenantHash);
  });
});

describe("extractBearer", () => {
  it("pulls the token out of an Authorization header", () => {
    const r = new Request("http://localhost", {
      headers: { authorization: "Bearer lpk_live_abc" },
    });
    expect(extractBearer(r)).toBe("lpk_live_abc");
  });
  it("returns null without header", () => {
    expect(extractBearer(new Request("http://localhost"))).toBeNull();
  });
});

function fakeAdmin(opts: { keyRow?: Record<string, unknown> | null; consumerRow?: Record<string, unknown> | null }) {
  const admin = {
    from(table: string) {
      const row = table === "passport_api_keys" ? (opts.keyRow ?? null) : (opts.consumerRow ?? null);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: row, error: null });
        },
        update() {
          return {
            eq: () => ({ then: (cb: (x: { error: null }) => void) => cb({ error: null }) }),
          };
        },
      };
    },
  };
  return admin as unknown as Parameters<typeof resolvePassportApiKey>[0];
}

describe("resolvePassportApiKey", () => {
  it("rejects malformed keys without DB lookup", async () => {
    const r = await resolvePassportApiKey(fakeAdmin({}), "lk_live_wrong_prefix");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_key_format");
  });

  it("rejects unknown keys", async () => {
    const r = await resolvePassportApiKey(fakeAdmin({ keyRow: null }), "lpk_live_xxxxxxxx");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unknown_key");
  });

  it("rejects revoked keys", async () => {
    const r = await resolvePassportApiKey(
      fakeAdmin({
        keyRow: {
          id: "k1",
          consumer_id: "c1",
          scopes: ["passport:verify"],
          revoked_at: "2026-01-01T00:00:00Z",
          expires_at: null,
        },
      }),
      "lpk_live_xxxxxxxx",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("revoked");
  });

  it("rejects expired keys", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const r = await resolvePassportApiKey(
      fakeAdmin({
        keyRow: {
          id: "k1",
          consumer_id: "c1",
          scopes: ["passport:verify"],
          revoked_at: null,
          expires_at: past,
        },
      }),
      "lpk_live_xxxxxxxx",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("expired");
  });

  it("rejects keys for suspended consumers", async () => {
    const r = await resolvePassportApiKey(
      fakeAdmin({
        keyRow: {
          id: "k1",
          consumer_id: "c1",
          scopes: ["passport:verify"],
          revoked_at: null,
          expires_at: null,
        },
        consumerRow: { status: "suspended", rate_limit_per_minute: 60, monthly_quota: 1000 },
      }),
      "lpk_live_xxxxxxxx",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("consumer_inactive");
  });

  it("returns the context for an active key + active consumer", async () => {
    const r = await resolvePassportApiKey(
      fakeAdmin({
        keyRow: {
          id: "k1",
          consumer_id: "c1",
          scopes: ["passport:verify"],
          revoked_at: null,
          expires_at: null,
        },
        consumerRow: { status: "active", rate_limit_per_minute: 60, monthly_quota: 1000 },
      }),
      "lpk_live_xxxxxxxx",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ctx.consumerId).toBe("c1");
      expect(r.ctx.scopes).toEqual(["passport:verify"]);
      expect(r.ctx.rateLimitPerMinute).toBe(60);
      expect(r.ctx.monthlyQuota).toBe(1000);
    }
  });
});

describe("hasPassportScope", () => {
  it("returns true with wildcard", () => {
    expect(
      hasPassportScope(
        { consumerId: "c", keyId: "k", scopes: ["*"], rateLimitPerMinute: 60, monthlyQuota: 1000 },
        "anything",
      ),
    ).toBe(true);
  });
  it("returns true when scope is present", () => {
    expect(
      hasPassportScope(
        { consumerId: "c", keyId: "k", scopes: ["passport:verify"], rateLimitPerMinute: 60, monthlyQuota: 1000 },
        "passport:verify",
      ),
    ).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(
      hasPassportScope(
        { consumerId: "c", keyId: "k", scopes: ["passport:read"], rateLimitPerMinute: 60, monthlyQuota: 1000 },
        "passport:verify",
      ),
    ).toBe(false);
  });
});

describe("checkPassportMonthlyQuota", () => {
  function fakeQuotaAdmin(count: number | null, error?: { message: string }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count, error: error ?? null }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("treats quota=0 as unlimited (allowed regardless of count)", async () => {
    const r = await checkPassportMonthlyQuota(fakeQuotaAdmin(999999), "c1", 0);
    expect(r.allowed).toBe(true);
  });

  it("allows when used < quota", async () => {
    const r = await checkPassportMonthlyQuota(fakeQuotaAdmin(50), "c1", 100);
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(50);
    expect(r.limit).toBe(100);
  });

  it("blocks when used == quota (over-limit on the next call)", async () => {
    const r = await checkPassportMonthlyQuota(fakeQuotaAdmin(100), "c1", 100);
    expect(r.allowed).toBe(false);
  });

  it("blocks when used > quota", async () => {
    const r = await checkPassportMonthlyQuota(fakeQuotaAdmin(150), "c1", 100);
    expect(r.allowed).toBe(false);
  });

  it("fails open on DB error (better to over-serve than lock out)", async () => {
    const r = await checkPassportMonthlyQuota(fakeQuotaAdmin(null, { message: "rpc down" }), "c1", 100);
    expect(r.allowed).toBe(true);
  });
});
