import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ updates: [] as unknown[], uploadError: null as { message: string } | null }));

vi.mock("@/lib/pdfCertificate", () => ({ renderCertificatePdf: async () => Buffer.from("%PDF") }));
vi.mock("@/lib/url", () => ({ certificatePublicUrl: () => "https://x/c/p" }));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => {
      const q = {
        update: (v: unknown) => {
          h.updates.push(v);
          return { eq: async () => ({ error: null }) };
        },
        select: () => q,
        eq: () => q,
        // PDF 生成のための証明書読み取りは失敗させる（PDF が作れない場合）
        single: async () => ({ data: null, error: { message: "db down" } }),
        maybeSingle: async () => ({ data: null, error: { message: "db down" } }),
      };
      return q;
    },
    storage: { from: () => ({ upload: async () => ({ error: h.uploadError }) }) },
  }),
}));

import { regenerateSignedPdf } from "../pdfUtils";

const info = {
  signedAt: "2026-10-12T00:00:00Z",
  signerEmail: "a@example.com",
  signaturePreview: "x",
  publicKeyFingerprint: "f",
  verifyUrl: "https://x/v",
  documentHash: "h",
};

beforeEach(() => {
  h.updates = [];
  h.uploadError = null;
});

describe("regenerateSignedPdf [署名日時の記録]", () => {
  it("PDF が作れなくても signed_at は記録する", async () => {
    await regenerateSignedPdf("c1", info);
    expect(h.updates).toEqual([{ signed_at: "2026-10-12T00:00:00Z" }]);
  });
});
