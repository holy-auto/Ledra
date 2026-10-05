import { describe, it, expect, vi } from "vitest";

/**
 * 一般の署名（/api/signature/sign）が引くセッションは証明書用（purpose='certificate'）だけ。
 * 受領サインのトークンでこの経路を通すと、電話番号下4桁の照合を飛ばして「署名済み」にできてしまう。
 */
const eqCalls: [string, unknown][] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (eqCalls.push([c, v]), b),
        gt: () => b,
        single: async () => ({ data: null, error: null }),
      };
      return b;
    },
  }),
}));

const { getValidSessionByToken } = await import("../session");

describe("getValidSessionByToken", () => {
  it("証明書用のセッションに絞って引く", async () => {
    await getValidSessionByToken("tok");
    expect(eqCalls).toContainEqual(["purpose", "certificate"]);
    expect(eqCalls).toContainEqual(["token", "tok"]);
  });
});
