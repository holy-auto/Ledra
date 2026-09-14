import { describe, it, expect, vi, beforeEach } from "vitest";

// 顧客が自分の連絡先を登録する口。ここが緩いと他人の顧客行を書き換えたり、
// 既存顧客の email を奪ってマイページの引き当てを乗っ取れるので、
// 検証の要点は「自分の行だけ・重複 email は拒否」。

const mocks = vi.hoisted(() => ({
  getTenantIdBySlug: vi.fn(),
  validateSession: vi.fn(),
  cookieGet: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/customerPortalServer", () => ({
  CUSTOMER_COOKIE: "hc_cs",
  getTenantIdBySlug: mocks.getTenantIdBySlug,
  validateSession: mocks.validateSession,
  normalizeEmail: (s: string) => s.trim().toLowerCase(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/customer/profile/route";

const TENANT = "tenant-1";
const CUSTOMER = "cust-1";

/**
 * customers への select/update を捌く最小モック。
 * `clash` を true にすると「他顧客が同じ email を使っている」状態を作る。
 */
function adminMock(opts: {
  current?: { id: string; email: string | null; phone: string | null } | null;
  /** ilike で引っかかる候補 (完全一致するとは限らない) */
  candidates?: { id: string; email: string }[];
  /** 重複チェックのクエリ自体が失敗する */
  clashError?: boolean;
}) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    updates,
    from() {
      // 重複チェックだけが .neq() を使う → それで問い合わせの種類を見分ける
      const b: {
        _neq: boolean;
        select: () => typeof b;
        update: (v: Record<string, unknown>) => typeof b;
        eq: () => typeof b;
        ilike: () => typeof b;
        or: () => typeof b;
        neq: () => typeof b;
        limit: () => Promise<{ data: unknown; error: unknown }> | typeof b;
        maybeSingle: () => Promise<{ data: unknown; error: null }>;
        then: (resolve: (v: unknown) => void) => void;
      } = {
        _neq: false,
        select: () => b,
        update: (v: Record<string, unknown>) => {
          updates.push(v);
          return b;
        },
        eq: () => b,
        ilike: () => b,
        or: () => b,
        neq: () => {
          b._neq = true;
          return b;
        },
        limit: () =>
          b._neq
            ? Promise.resolve({
                data: opts.clashError ? null : (opts.candidates ?? []),
                error: opts.clashError ? { message: "db down" } : null,
              })
            : b,
        maybeSingle: async () => ({
          data: opts.current === undefined ? { id: CUSTOMER, email: null, phone: null } : opts.current,
          error: null,
        }),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return b;
    },
  };
  return { admin, tenantId: TENANT, _ref: admin };
}

function req(body: unknown): Request {
  return new Request("https://app/api/customer/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTenantIdBySlug.mockResolvedValue(TENANT);
  mocks.cookieGet.mockReturnValue({ value: "good-token" });
  mocks.validateSession.mockResolvedValue({ email: null, phone_last4_hash: null, customer_id: CUSTOMER });
  mocks.createTenantScopedAdmin.mockReturnValue(adminMock({}));
});

describe("POST /api/customer/profile", () => {
  it("email を登録できる", async () => {
    const scoped = adminMock({});
    mocks.createTenantScopedAdmin.mockReturnValue(scoped);

    const res = await POST(req({ tenant_slug: "demo", email: "Me@Example.com" }));

    expect(res.status).toBe(200);
    expect(scoped._ref.updates[0]).toMatchObject({ email: "me@example.com" });
  });

  it("同一テナントの他顧客が使っている email は拒否する", async () => {
    const scoped = adminMock({ candidates: [{ id: "other-customer", email: "taken@example.com" }] });
    mocks.createTenantScopedAdmin.mockReturnValue(scoped);

    const res = await POST(req({ tenant_slug: "demo", email: "taken@example.com" }));

    expect(res.status).toBe(400);
    expect(scoped._ref.updates).toHaveLength(0);
  });

  it("ilike のワイルドカード一致だけでは拒否しない (a_b@ は axb@ と別物)", async () => {
    // `_` は ilike のワイルドカードなので候補には挙がるが、完全一致ではないので通す。
    const scoped = adminMock({ candidates: [{ id: "other-customer", email: "axb@example.com" }] });
    mocks.createTenantScopedAdmin.mockReturnValue(scoped);

    const res = await POST(req({ tenant_slug: "demo", email: "a_b@example.com" }));

    expect(res.status).toBe(200);
    expect(scoped._ref.updates[0]).toMatchObject({ email: "a_b@example.com" });
  });

  it("重複チェックが失敗したら書き込まない (fail-open にしない)", async () => {
    const scoped = adminMock({ clashError: true });
    mocks.createTenantScopedAdmin.mockReturnValue(scoped);

    const res = await POST(req({ tenant_slug: "demo", email: "me@example.com" }));

    expect(res.status).toBe(500);
    expect(scoped._ref.updates).toHaveLength(0);
  });

  it("登録済みの email は上書きできない (ログイン identity の差し替えを防ぐ)", async () => {
    const scoped = adminMock({ current: { id: CUSTOMER, email: "old@example.com", phone: null } });
    mocks.createTenantScopedAdmin.mockReturnValue(scoped);

    const res = await POST(req({ tenant_slug: "demo", email: "new@example.com" }));

    expect(res.status).toBe(400);
    expect(scoped._ref.updates).toHaveLength(0);
  });

  it("登録済みの電話番号も上書きできない", async () => {
    const scoped = adminMock({ current: { id: CUSTOMER, email: null, phone: "090-0000-0000" } });
    mocks.createTenantScopedAdmin.mockReturnValue(scoped);

    const res = await POST(req({ tenant_slug: "demo", phone: "080-1111-2222" }));

    expect(res.status).toBe(400);
    expect(scoped._ref.updates).toHaveLength(0);
  });

  it("customer_id を持たないセッションは 401 (更新対象の行を特定できない)", async () => {
    mocks.validateSession.mockResolvedValue({ email: "a@b.com", phone_last4_hash: "h", customer_id: null });

    const res = await POST(req({ tenant_slug: "demo", email: "me@example.com" }));

    expect(res.status).toBe(401);
  });

  it("セッションが無ければ 401", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const res = await POST(req({ tenant_slug: "demo", email: "me@example.com" }));
    expect(res.status).toBe(401);
  });

  it("不正な形式の email は 400", async () => {
    const res = await POST(req({ tenant_slug: "demo", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("登録する項目が無ければ 400", async () => {
    const res = await POST(req({ tenant_slug: "demo" }));
    expect(res.status).toBe(400);
  });

  it("未知のテナントは 404", async () => {
    mocks.getTenantIdBySlug.mockResolvedValue(null);
    const res = await POST(req({ tenant_slug: "nope", email: "me@example.com" }));
    expect(res.status).toBe(404);
  });
});
