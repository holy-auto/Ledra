import { describe, it, expect, vi, beforeEach } from "vitest";

/** スタッフ用 PDF 署名の発行: 自テナントの有効な証明書に、staff 以上にだけ出す。 */
let caller: { userId: string; tenantId: string; role: string } | null;
vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: async () => caller }));
vi.mock("@/lib/auth/checkRole", () => ({
  requireMinRole: (c: { role: string }) => c.role !== "viewer",
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
const eqCalls: [string, unknown][] = [];
let row: unknown;
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: (c: string, v: unknown) => (eqCalls.push([c, v]), b),
          maybeSingle: async () => ({ data: row, error: null }),
        };
        return b;
      },
    },
  }),
}));

process.env.INTEGRATION_OAUTH_STATE_SECRET = "x".repeat(40);
const { POST } = await import("../route");
const { isValidStaffPdfToken } = await import("@/lib/certificates/staffPdfLink");
const call = () =>
  POST(
    new Request("https://app.example/api/mobile/certificates/pdf-link", {
      method: "POST",
      body: JSON.stringify({ public_id: "PID-0001" }),
    }) as never,
  );

describe("POST /api/mobile/certificates/pdf-link", () => {
  beforeEach(() => {
    caller = { userId: "u1", tenantId: "t1", role: "staff" };
    row = { id: "c1", status: "active" };
    eqCalls.length = 0;
  });

  it("自テナントの有効な証明書なら、その証明書・テナント用の署名を返す", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect(isValidStaffPdfToken(token, "PID-0001", "t1")).toBe(true);
    expect(eqCalls).toEqual([
      ["tenant_id", "t1"],
      ["public_id", "PID-0001"],
    ]);
  });
  it("見つからない（他テナント含む）・無効な証明書には出さない", async () => {
    row = null;
    expect((await call()).status).toBe(404);
    row = { id: "c1", status: "void" };
    expect((await call()).status).toBe(404);
  });
  it("未認証は 401、viewer は 403", async () => {
    caller = null;
    expect((await call()).status).toBe(401);
    caller = { userId: "u1", tenantId: "t1", role: "viewer" };
    expect((await call()).status).toBe(403);
  });
});
