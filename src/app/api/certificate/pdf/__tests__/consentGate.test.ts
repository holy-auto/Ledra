import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 公開 PDF の電子交付承諾ゲート（G3/G4）の配線テスト。判定ロジック自体は deliveryConsent.test.ts が持つので、
 * ここは「正しいテナント・顧客で判定し、止めたら PDF を出さず、通したら先へ進む」ことだけを見る。
 */
const UNVERIFIED = "unverified";
const gate = vi.fn();
vi.mock("@/lib/delivery/deliveryConsent", () => ({
  BLOCKED_UNVERIFIED: "unverified",
  electronicDeliveryBlockMessage: (...a: unknown[]) => gate(...a),
}));
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
// 通過後の描画処理は本テストの対象外。ゲートを越えたことだけ分かればよいので、最初の後続処理で止める。
vi.mock("next/headers", () => ({
  headers: async () => {
    throw new Error("PASSED_GATE");
  },
}));

const PID = "LEDRA-TEST-0001";
let certRow: { data: unknown; error: unknown };
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (t: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        maybeSingle: async () =>
          t === "certificates_public" ? { data: { public_id: PID, status: "active" }, error: null } : certRow,
      };
      return b;
    },
  }),
}));

const { GET } = await import("../route");
const req = (accept: string) =>
  new Request(`https://app.example/api/certificate/pdf?pid=${PID}`, { headers: { accept } });
const ROW = { id: "cert1", tenant_id: "t1", vehicle_id: null, customer_id: "cust1" };

describe("公開 PDF の電子交付承諾ゲート", () => {
  beforeEach(() => {
    gate.mockReset();
    audit.mockReset();
    certRow = { data: ROW, error: null };
  });

  it("承諾で止める: 画面遷移は公開ページへ 303（pdf_blocked_consent）、閲覧ログも残さない", async () => {
    gate.mockResolvedValue("この顧客は電子交付の承諾を撤回しています。");
    const res = await GET(req("text/html"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://app.example/c/${PID}?notice=pdf_blocked_consent`);
    expect(gate).toHaveBeenCalledWith(expect.anything(), "t1", "cust1");
    expect(audit).not.toHaveBeenCalled();
  });

  it("承諾で止める: fetch は 403、店舗向けの理由（撤回の有無）は返さない", async () => {
    gate.mockResolvedValue("この顧客は電子交付の承諾を撤回しています。");
    const res = await GET(req("application/json"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("delivery_consent_blocked");
    expect(body.message).not.toMatch(/撤回/);
  });

  it("判定できない（承諾の確認失敗・証明書行の取得失敗）は承諾の問題とせず再試行案内（503 / pdf_unavailable）", async () => {
    gate.mockResolvedValue(UNVERIFIED);
    expect((await GET(req("application/json"))).status).toBe(503);
    certRow = { data: null, error: { message: "boom" } };
    const res = await GET(req("text/html"));
    expect(res.headers.get("location")).toBe(`https://app.example/c/${PID}?notice=pdf_unavailable`);
    expect(audit).not.toHaveBeenCalled();
  });

  it("通す: 閲覧ログを残して PDF 生成へ進む", async () => {
    gate.mockResolvedValue(null);
    await expect(GET(req("text/html"))).rejects.toThrow("PASSED_GATE");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", certificateId: "cert1" }));
  });
});
