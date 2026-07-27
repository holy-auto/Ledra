import { describe, it, expect } from "vitest";
import { interpretC2paValidation } from "../c2paVerify";

describe("interpretC2paValidation", () => {
  it("validation_status が空なら有効", () => {
    expect(interpretC2paValidation([])).toBe(true);
  });

  it("信頼リスト未登録(untrusted)だけなら有効扱い（外部の未知署名者は常態）", () => {
    expect(interpretC2paValidation(["signingCredential.untrusted"])).toBe(true);
  });

  it("dataHash 不一致（改変）は無効", () => {
    expect(interpretC2paValidation(["assertion.dataHash.mismatch"])).toBe(false);
  });

  it("署名無効・失効・欠落は無効", () => {
    expect(interpretC2paValidation(["claimSignature.invalid"])).toBe(false);
    expect(interpretC2paValidation(["signingCredential.revoked"])).toBe(false);
    expect(interpretC2paValidation(["signingCredential.expired"])).toBe(false);
    expect(interpretC2paValidation(["assertion.hashedURI.mismatch"])).toBe(false);
  });

  it("untrusted と致命コードが混在すれば無効（致命を優先）", () => {
    expect(interpretC2paValidation(["signingCredential.untrusted", "assertion.dataHash.mismatch"])).toBe(false);
  });
});
