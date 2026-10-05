import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 公開 PDF の電子交付承諾ゲート（G3/G4）の配線テスト。判定ロジック自体は deliveryConsent.test.ts が持つので、
 * ここは「正しいテナント・顧客で判定し、止めたら PDF を出さない」ことだけを見る。
 */
const gate = vi.fn();
vi.mock("@/lib/delivery/deliveryConsent", () => ({ electronicDeliveryBlockMessage: (...a: unknown[]) => gate(...a) }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/billing/guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/guard")>()),
  enforceBilling: async () => null,
}));
const audit = vi.fn();
vi.mock("@/lib/audit/certificateLog", () => ({ logCertificateAction: audit, getRequestMeta: () => ({}) }));

const PID = "LEDRA-TEST-0001";
const tables: Record<string, unknown> = {
  certificates_public: { public_id: PID, status: "active" },
  certificates: { tenant_id: "t1", id: "cert1", vehicle_id: null, customer_id: "cust1" },
};
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (t: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: tables[t] ?? null, error: null }),
      };
      return b;
    },
  }),
}));

const { GET } = await import("../route");
const req = (accept: string) =>
  new Request(`https://app.example/api/certificate/pdf?pid=${PID}`, { headers: { accept } });

describe("公開 PDF の電子交付承諾ゲート", () => {
  beforeEach(() => {
    gate.mockReset();
    audit.mockReset();
  });

  it("ブロック時: 画面遷移なら公開ページへ 303、PDF は出さず閲覧ログも残さない", async () => {
    gate.mockResolvedValue("撤回済み");
    const res = await GET(req("text/html"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://app.example/c/${PID}?notice=pdf_blocked_consent`);
    expect(gate).toHaveBeenCalledWith(expect.anything(), "t1", "cust1");
    expect(audit).not.toHaveBeenCalled();
  });

  it("ブロック時: fetch（非遷移）なら 403 JSON", async () => {
    gate.mockResolvedValue("撤回済み");
    const res = await GET(req("application/json"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "delivery_consent_blocked" });
  });
});
