import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  isPlatformAdmin: vi.fn(),
  createPlatformScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveCallerWithRole: mocks.resolveCallerWithRole }));
vi.mock("@/lib/auth/platformAdmin", () => ({ isPlatformAdmin: mocks.isPlatformAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createPlatformScopedAdmin: mocks.createPlatformScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET as listGET, POST as listPOST } from "@/app/api/admin/platform/passport-consumers/route";
import { POST as keyPOST } from "@/app/api/admin/platform/passport-consumers/[id]/keys/route";
import { DELETE as keyDELETE } from "@/app/api/admin/platform/passport-consumers/[id]/keys/[keyId]/route";

const CALLER = { userId: "u1", tenantId: "platform", role: "super_admin", planTier: "pro" };

// The handlers expect NextRequest but a plain Request suffices at runtime
// because we never touch nextUrl/cookies in the assertions we make.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReq = any;

function jsonReq(url: string, method: string, body?: unknown): AnyReq {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
  mocks.isPlatformAdmin.mockReturnValue(true);
  process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";
});

describe("GET /api/admin/platform/passport-consumers", () => {
  it("403 when caller is not platform admin", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    mocks.isPlatformAdmin.mockReturnValueOnce(false);
    const res = await listGET();
    expect(res.status).toBe(403);
  });

  it("aggregates active key counts and 30d call counts per consumer", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);

    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000).toISOString();
    const past = new Date(now.getTime() - 86_400_000).toISOString();

    mocks.createPlatformScopedAdmin.mockReturnValueOnce({
      from: (table: string) => {
        if (table === "passport_api_consumers") {
          return {
            select: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "c1",
                      name: "A",
                      contact_email: "a@example.com",
                      status: "active",
                      monthly_quota: 1000,
                      rate_limit_per_minute: 60,
                      created_at: now.toISOString(),
                      updated_at: now.toISOString(),
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        if (table === "passport_api_keys") {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    // active
                    { consumer_id: "c1", expires_at: future, revoked_at: null, last_used_at: now.toISOString() },
                    // expired → not active
                    { consumer_id: "c1", expires_at: past, revoked_at: null, last_used_at: null },
                    // revoked → not active
                    { consumer_id: "c1", expires_at: null, revoked_at: past, last_used_at: null },
                  ],
                  error: null,
                }),
            }),
          };
        }
        if (table === "passport_api_call_logs") {
          return {
            select: () => ({
              in: () => ({
                gte: () =>
                  Promise.resolve({
                    data: [{ consumer_id: "c1" }, { consumer_id: "c1" }, { consumer_id: "c1" }],
                    error: null,
                  }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    const res = await listGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      consumers: { id: string; active_key_count: number; call_count_30d: number }[];
    };
    expect(body.consumers).toHaveLength(1);
    expect(body.consumers[0]).toMatchObject({
      id: "c1",
      active_key_count: 1,
      call_count_30d: 3,
    });
  });
});

describe("POST /api/admin/platform/passport-consumers", () => {
  it("400 on missing email", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    const res = await listPOST(jsonReq("http://l/c", "POST", { name: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("creates a consumer and returns it", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    mocks.createPlatformScopedAdmin.mockReturnValueOnce({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: "c-new",
                  name: "Acme",
                  contact_email: "ops@acme.example",
                  status: "active",
                  monthly_quota: 1000,
                  rate_limit_per_minute: 60,
                  created_at: "2026-05-26",
                  updated_at: "2026-05-26",
                },
                error: null,
              }),
          }),
        }),
      }),
    });

    const res = await listPOST(jsonReq("http://l/c", "POST", { name: "Acme", contact_email: "ops@acme.example" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { consumer: { id: string; name: string } };
    expect(body.consumer.id).toBe("c-new");
    expect(body.consumer.name).toBe("Acme");
  });
});

describe("POST /api/admin/platform/passport-consumers/[id]/keys", () => {
  it("returns plaintext lpk_live_ key on success (shown once)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    mocks.createPlatformScopedAdmin.mockReturnValueOnce({
      from: (table: string) => {
        if (table === "passport_api_consumers") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "c1", status: "active" }, error: null }),
              }),
            }),
          };
        }
        return {
          insert: (doc: Record<string, unknown>) => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "k-new",
                    name: doc.name,
                    key_prefix: doc.key_prefix,
                    scopes: doc.scopes,
                    last_used_at: null,
                    expires_at: null,
                    revoked_at: null,
                    created_at: "2026-05-26",
                  },
                  error: null,
                }),
            }),
          }),
        };
      },
    });

    const res = await keyPOST(jsonReq("http://l/c/c1/keys", "POST", { name: "prod", scopes: ["passport:verify"] }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; meta: { key_prefix: string } };
    expect(body.key).toMatch(/^lpk_live_/);
    expect(body.meta.key_prefix).toBe(body.key.slice(0, 12));
  });

  it("404 when consumer does not exist", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    mocks.createPlatformScopedAdmin.mockReturnValueOnce({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    });
    const res = await keyPOST(jsonReq("http://l/c/missing/keys", "POST", { name: "x" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/platform/passport-consumers/[id]/keys/[keyId]", () => {
  it("soft-revokes by setting revoked_at", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    let updatePayload: Record<string, unknown> | null = null;
    mocks.createPlatformScopedAdmin.mockReturnValueOnce({
      from: () => ({
        update: (doc: Record<string, unknown>) => {
          updatePayload = doc;
          return {
            eq: () => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    maybeSingle: () => Promise.resolve({ data: { id: "k1" }, error: null }),
                  }),
                }),
              }),
            }),
          };
        },
      }),
    });

    const res = await keyDELETE(jsonReq("http://l/c/c1/keys/k1", "DELETE"), {
      params: Promise.resolve({ id: "c1", keyId: "k1" }),
    });
    expect(res.status).toBe(200);
    expect(updatePayload).not.toBeNull();
    expect(typeof (updatePayload as unknown as { revoked_at: string }).revoked_at).toBe("string");
  });

  it("404 when key is missing or already revoked", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(CALLER);
    mocks.createPlatformScopedAdmin.mockReturnValueOnce({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const res = await keyDELETE(jsonReq("http://l/c/c1/keys/k1", "DELETE"), {
      params: Promise.resolve({ id: "c1", keyId: "k1" }),
    });
    expect(res.status).toBe(404);
  });
});
