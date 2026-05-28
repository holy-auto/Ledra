/**
 * Phase 0 ガード: JPKI 型と未実装スタブが期待どおりにエクスポートされていることを確認.
 * 本実装 (Phase 1) で本テストは大幅に置き換える.
 */
import { describe, it, expect } from "vitest";
import type { JpkiVerificationResult, JpkiAttributes } from "../types";
import { parseCertificate, verifyCertificateChain } from "../verifyCertificate";
import { checkRevocation } from "../crl";

describe("jpki Phase 0 stubs", () => {
  it("verifyCertificateChain throws not-implemented", () => {
    expect(() => verifyCertificateChain(new Uint8Array())).toThrow(/not implemented/i);
  });

  it("parseCertificate throws not-implemented", () => {
    expect(() => parseCertificate(new Uint8Array())).toThrow(/not implemented/i);
  });

  it("checkRevocation throws not-implemented", async () => {
    await expect(checkRevocation("00")).rejects.toThrow(/not implemented/i);
  });

  it("type shape compiles", () => {
    const attrs: JpkiAttributes = {
      name: "山田 太郎",
      address: "東京都渋谷区道玄坂",
      birthDate: "1990-01-23",
      gender: "male",
    };
    const result: JpkiVerificationResult = {
      ok: true,
      attributes: attrs,
      certificate: {
        serialNumber: "DEADBEEF",
        issuerDn: "CN=J-LIS Personal Authentication CA",
        notBefore: "2025-01-01T00:00:00Z",
        notAfter: "2030-01-01T00:00:00Z",
        kind: "signing",
      },
      revocation: { state: "good", checkedAt: new Date().toISOString(), method: "crl" },
    };
    expect(result.ok).toBe(true);
    expect(result.attributes?.name).toContain("山田");
  });
});
