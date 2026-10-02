import { describe, it, expect } from "vitest";
import {
  deliveryConsentStatus,
  isElectronicDeliveryBlocked,
  computeDeliveryConsentTextHash,
  deliveryConsentText,
  DELIVERY_CONSENT_VERSION,
} from "../deliveryConsent";

describe("deliveryConsent [G3/G4 電子交付の承諾]", () => {
  it("行なし=none / granted / revoked を返す", () => {
    expect(deliveryConsentStatus(null)).toBe("none");
    expect(deliveryConsentStatus(undefined)).toBe("none");
    expect(deliveryConsentStatus({ status: "granted" })).toBe("granted");
    expect(deliveryConsentStatus({ status: "revoked" })).toBe("revoked");
  });

  it("ブロックは撤回済みのときだけ（未承諾・承諾済みは通す＝非破壊既定）", () => {
    expect(isElectronicDeliveryBlocked(null)).toBe(false); // none → 通す
    expect(isElectronicDeliveryBlocked({ status: "granted" })).toBe(false);
    expect(isElectronicDeliveryBlocked({ status: "revoked" })).toBe(true); // G4: 撤回は交付不可
  });

  it("開示文言は交付方法を列挙し、撤回できる旨を含む", () => {
    const t = deliveryConsentText();
    expect(t).toMatch(/電子メール/);
    expect(t).toMatch(/撤回/);
  });

  it("consent_text_hash は安定（同じ文言→同じ SHA-256・64hex）", () => {
    const h1 = computeDeliveryConsentTextHash();
    const h2 = computeDeliveryConsentTextHash();
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(DELIVERY_CONSENT_VERSION).toBe("delivery-consent-v1");
  });
});
