import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  BODY_REPAIR_CONSENT_VERSION,
  CONSENT_KIND_PURPOSE,
  CONSENT_KIND_LABEL,
  getConsentText,
  getConsentTextByVersion,
  computeConsentTextHash,
  buildBodyRepairConsentPayload,
  canonicalizeExplanation,
} from "../bodyRepairConsent";

describe("bodyRepairConsent", () => {
  it("kind → purpose マッピングが正しい", () => {
    expect(CONSENT_KIND_PURPOSE.pre_work).toBe("estimate_consent");
    expect(CONSENT_KIND_PURPOSE.change).toBe("change_consent");
  });

  it("kind ごとにラベルと文言がある", () => {
    for (const kind of ["pre_work", "change"] as const) {
      expect(CONSENT_KIND_LABEL[kind]).toBeTruthy();
      expect(getConsentText(kind).length).toBeGreaterThan(10);
    }
  });

  it("getConsentTextByVersion は version+kind 凍結文言を返す", () => {
    expect(getConsentTextByVersion(BODY_REPAIR_CONSENT_VERSION, "pre_work")).toBe(getConsentText("pre_work"));
    expect(getConsentTextByVersion(BODY_REPAIR_CONSENT_VERSION, "change")).toBe(getConsentText("change"));
    expect(getConsentTextByVersion("unknown-version", "pre_work")).toBeNull();
    expect(getConsentTextByVersion(null, "pre_work")).toBeNull();
  });

  it("computeConsentTextHash は決定的で kind ごとに異なる", () => {
    const a = computeConsentTextHash("pre_work");
    const b = computeConsentTextHash("change");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(computeConsentTextHash("pre_work")); // 決定的
    expect(a).not.toBe(b); // kind 依存
  });

  it("computeConsentTextHash は表示文言と一致する (drift 検出の要)", () => {
    const expected = createHash("sha256").update(getConsentText("pre_work"), "utf8").digest("hex");
    expect(computeConsentTextHash("pre_work")).toBe(expected);
  });

  it("buildBodyRepairConsentPayload は全要素を : 区切りで小文字連結する", () => {
    const payload = buildBodyRepairConsentPayload({
      documentHash: "ABC123",
      signedAt: "2026-06-21T00:00:00.000Z",
      signerEmail: "User@Example.com",
      phoneLast4Hash: "HASH",
      consentVersion: BODY_REPAIR_CONSENT_VERSION,
      consentTextHash: "THASH",
      kind: "pre_work",
      bodyRepairJobId: "JOB",
      sessionId: "SESS",
    });
    expect(payload).toBe(payload.toLowerCase());
    expect(payload.startsWith("ledra-body-repair-consent-v1:")).toBe(true);
    expect(payload).toContain(":pre_work:");
    expect(payload).toContain(":job:");
    expect(payload).toContain(":sess");
  });

  it("canonicalizeExplanation は安定した JSON 文字列を返す", () => {
    const snap = {
      kind: "pre_work" as const,
      shop: { name: "テスト店" },
      vehicle: null,
      work: { planned: { methods: "塗装" }, actual: null, deviation_reason: null },
      fees: { estimate_amount: 1000, actual_amount: null },
    };
    const s = canonicalizeExplanation(snap);
    expect(JSON.parse(s)).toMatchObject({ kind: "pre_work", shop: { name: "テスト店" } });
  });
});
