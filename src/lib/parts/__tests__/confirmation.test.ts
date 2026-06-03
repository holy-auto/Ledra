import { describe, it, expect, beforeAll } from "vitest";
import { normalizeE164JP, phoneFullHash } from "@/lib/parts/phoneIdentity";
import { resolveConfirmation } from "@/lib/parts/confirmationPolicy";
import { buildPartSigningPayload, PART_SIGNATURE_PAYLOAD_VERSION } from "@/lib/parts/partSigning";

describe("normalizeE164JP", () => {
  it("先頭0を+81に", () => {
    expect(normalizeE164JP("090-1234-5678")).toBe("+819012345678");
  });
  it("81始まりは+付与", () => {
    expect(normalizeE164JP("819012345678")).toBe("+819012345678");
  });
  it("+81はそのまま桁だけ", () => {
    expect(normalizeE164JP("+81 90 1234 5678")).toBe("+819012345678");
  });
  it("空はエラー", () => {
    expect(() => normalizeE164JP("--")).toThrow();
  });
});

describe("phoneFullHash", () => {
  beforeAll(() => {
    process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";
  });
  it("決定的", () => {
    expect(phoneFullHash("t1", "+819012345678")).toBe(phoneFullHash("t1", "+819012345678"));
  });
  it("テナントが違えば別ハッシュ", () => {
    expect(phoneFullHash("t1", "+819012345678")).not.toBe(phoneFullHash("t2", "+819012345678"));
  });
});

describe("resolveConfirmation", () => {
  it("高額(customer_otp)＋顧客登録連絡先＋LINE → customer_otp/line", () => {
    const d = resolveConfirmation({
      requiredAssurance: "customer_otp",
      contactProvenance: "customer",
      lineLinked: true,
      phoneAvailable: true,
    });
    expect(d).toEqual({ ok: true, assurance: "customer_otp", channel: "line" });
  });

  it("LINE未連携はSMSフォールバック", () => {
    const d = resolveConfirmation({
      requiredAssurance: "customer_otp",
      contactProvenance: "customer",
      lineLinked: false,
      phoneAvailable: true,
    });
    expect(d).toMatchObject({ ok: true, channel: "sms" });
  });

  it("T7': 高額で店入力連絡先は拒否", () => {
    const d = resolveConfirmation({
      requiredAssurance: "customer_otp",
      contactProvenance: "store",
      lineLinked: false,
      phoneAvailable: true,
    });
    expect(d.ok).toBe(false);
  });

  it("低リスク(any)＋店入力連絡先は store_contact_otp で可", () => {
    const d = resolveConfirmation({
      requiredAssurance: "any",
      contactProvenance: "store",
      lineLinked: false,
      phoneAvailable: true,
    });
    expect(d).toMatchObject({ ok: true, assurance: "store_contact_otp" });
  });

  it("店頭タブレットは any のみ許可", () => {
    expect(
      resolveConfirmation({
        requiredAssurance: "any",
        contactProvenance: null,
        lineLinked: false,
        phoneAvailable: false,
        inStoreTablet: true,
      }),
    ).toEqual({ ok: true, assurance: "in_store_tablet", channel: "in_store_tablet" });
  });

  it("店頭タブレットは高リスクで拒否", () => {
    expect(
      resolveConfirmation({
        requiredAssurance: "customer_otp",
        contactProvenance: null,
        lineLinked: false,
        phoneAvailable: false,
        inStoreTablet: true,
      }).ok,
    ).toBe(false);
  });

  it("連絡先なしは拒否", () => {
    expect(
      resolveConfirmation({
        requiredAssurance: "any",
        contactProvenance: null,
        lineLinked: false,
        phoneAvailable: false,
      }).ok,
    ).toBe(false);
  });
});

describe("buildPartSigningPayload", () => {
  const args = {
    contentHash: "ABC",
    signedAt: "2026-06-03T00:00:00.000Z",
    installationId: "Inst-1",
    signatureId: "Sig-1",
    signerPhoneFullHash: "PHASH",
  };
  it("バージョンを含み小文字化して決定的", () => {
    const p = buildPartSigningPayload(args);
    expect(p.startsWith(PART_SIGNATURE_PAYLOAD_VERSION)).toBe(true);
    expect(p).toBe(buildPartSigningPayload(args));
    expect(p).toContain("abc");
    expect(p).toContain("phash");
  });
  it("content_hash が変わると payload も変わる", () => {
    expect(buildPartSigningPayload(args)).not.toBe(buildPartSigningPayload({ ...args, contentHash: "XYZ" }));
  });
});
