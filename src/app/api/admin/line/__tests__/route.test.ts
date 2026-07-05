/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requireMinRole: (caller: { role: string }, minRole: string) => {
    const rank: Record<string, number> = { super_admin: 5, owner: 4, admin: 3, staff: 2, viewer: 1 };
    return (rank[caller.role] ?? 0) >= (rank[minRole] ?? 0);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/crypto/tenantSecrets", () => ({
  buildSecretWrite: async (v: string | null) => ({ ciphertext: v ? `enc:${v}` : null }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, POST } from "@/app/api/admin/line/route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ADMIN = { userId: "u1", tenantId: TENANT, role: "admin", planTier: "pro" };

function makeReq(body?: unknown) {
  const url = `http://localhost/api/admin/line`;
  return {
    json: async () => body,
    nextUrl: new URL(url),
    url,
  } as any;
}

/** tenants テーブルの select/update を追跡する fluent モック */
function buildAdmin(opts: { selectResult?: { data: unknown; error: unknown }; updateError?: unknown } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from() {
      const b: any = {
        select: () => b,
        eq: () => b,
        single: async () => opts.selectResult ?? { data: null, error: null },
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          const u: any = { eq: () => Promise.resolve({ error: opts.updateError ?? null }) };
          return u;
        },
      };
      return b;
    },
  };
  return { admin, updates };
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  mocks.resolveCallerWithRole.mockReset().mockResolvedValue(ADMIN);
  mocks.createTenantScopedAdmin.mockReset();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/admin/line configure", () => {
  it("rejects an invalid access token without writing to DB", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 })) as any;
    const { admin, updates } = buildAdmin();
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await POST(
      makeReq({ action: "configure", channel_id: "123", channel_secret: "s", channel_access_token: "bad" }),
    );

    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("saves config and returns the webhook URL when the token is valid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ basicId: "@ledra", displayName: "Ledra" }), { status: 200 }),
      ) as any;
    const { admin, updates } = buildAdmin();
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await POST(
      makeReq({ action: "configure", channel_id: "123", channel_secret: "s", channel_access_token: "good" }),
    );
    const j = await res.json();

    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ line_channel_id: "123", line_enabled: true });
    expect(j.webhook_url).toBe(`http://localhost/api/line/webhook?tenant_id=${TENANT}`);
    expect(j.bot_basic_id).toBe("@ledra");
  });

  it("surfaces DB update failures instead of reporting success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as any;
    const { admin } = buildAdmin({ updateError: { message: "column does not exist" } });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await POST(
      makeReq({ action: "configure", channel_id: "123", channel_secret: "s", channel_access_token: "good" }),
    );

    expect(res.status).toBe(500);
  });
});

describe("GET /api/admin/line", () => {
  it("surfaces select failures instead of pretending to be disconnected", async () => {
    const { admin } = buildAdmin({ selectResult: { data: null, error: { message: "column does not exist" } } });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });

  it("returns webhook_url when connected", async () => {
    const { admin } = buildAdmin({
      selectResult: {
        data: { line_channel_id: "123", line_liff_id: null, line_enabled: true, line_link_prompt_enabled: false },
        error: null,
      },
    });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await GET(makeReq());
    const j = await res.json();
    expect(j.enabled).toBe(true);
    expect(j.webhook_url).toBe(`http://localhost/api/line/webhook?tenant_id=${TENANT}`);
  });
});
