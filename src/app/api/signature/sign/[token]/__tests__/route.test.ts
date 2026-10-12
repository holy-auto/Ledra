/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  certUpdates: [] as unknown[],
  afterCallbacks: [] as unknown[],
  regenerate: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  // 応答後の処理は実行せず、登録されたことだけ記録する
  after: (cb: unknown) => h.afterCallbacks.push(cb),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/signature/session", () => ({
  getValidSessionByToken: async () => ({
    id: "s1",
    certificate_id: "c1",
    document_hash: "dh",
    signer_name: null,
  }),
}));
vi.mock("@/lib/delivery/deliveryConsent", () => ({ customerFacingDeliveryBlock: async () => null }));
vi.mock("@/lib/signature/signer", () => ({
  signPayloadWithProvider: async () => ({ signature: "sig".repeat(20), keyVersion: "v1", publicKeyFingerprint: "fp" }),
}));
vi.mock("@/lib/signature/pdfUtils", () => ({ regenerateSignedPdf: h.regenerate }));
vi.mock("@/lib/email/sendEmail", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (t: string) => {
      const q: any = {
        update: (v: unknown) => {
          if (t === "certificates") h.certUpdates.push(v);
          return q;
        },
        insert: async () => ({ error: null }),
        eq: () => q,
        then: (res: (v: unknown) => unknown) => res({ error: null }),
      };
      return q;
    },
  }),
}));

import { POST } from "../route";

const req = () =>
  new Request("http://x/api/signature/sign/t", {
    method: "POST",
    body: JSON.stringify({ signer_email: "a@example.com", agreed: true }),
  }) as any;

beforeEach(() => {
  h.certUpdates = [];
  h.afterCallbacks = [];
  h.regenerate.mockReset();
});

describe("POST /api/signature/sign/[token] [署名日時の記録]", () => {
  it("証明書の signed_at を応答前に記録し、PDF 再生成は応答後（after）に回す", async () => {
    const res = await POST(req(), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // 応答前に記録済み（PDF 再生成の成否に依存しない）
    expect(h.certUpdates).toEqual([{ signed_at: body.signed_at }]);
    // PDF 再生成と店舗通知は after() に登録されただけで、まだ走っていない
    expect(h.afterCallbacks).toHaveLength(2);
    expect(h.regenerate).not.toHaveBeenCalled();
  });
});
