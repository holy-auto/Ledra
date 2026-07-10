import { describe, expect, it } from "vitest";
import { planPhoneHashBackfill } from "../backfill-certificate-phone-hash";

// recipe には依存しないダミー。分類ロジックだけを検証する。
const fakeHash = (tenantId: string, last4: string) => `HASH(${tenantId}:${last4})`;

describe("planPhoneHashBackfill (電話ハッシュ backfill の行分類)", () => {
  it("ハッシュ未設定 + 平文4桁 → hash を計算する", () => {
    const r = planPhoneHashBackfill(
      { tenant_id: "t1", customer_phone_last4: "1234", customer_phone_last4_hash: null },
      fakeHash,
    );
    expect(r).toEqual({ action: "hash", hash: "HASH(t1:1234)" });
  });

  it("既にハッシュ済みは skip_already（絶対に上書きしない）", () => {
    const r = planPhoneHashBackfill(
      { tenant_id: "t1", customer_phone_last4: "1234", customer_phone_last4_hash: "existing" },
      fakeHash,
    );
    expect(r.action).toBe("skip_already");
    expect(r.hash).toBeUndefined();
  });

  it("平文が空 / NULL は skip_no_plaintext", () => {
    expect(
      planPhoneHashBackfill({ tenant_id: "t1", customer_phone_last4: null, customer_phone_last4_hash: null }, fakeHash)
        .action,
    ).toBe("skip_no_plaintext");
    expect(
      planPhoneHashBackfill({ tenant_id: "t1", customer_phone_last4: "   ", customer_phone_last4_hash: null }, fakeHash)
        .action,
    ).toBe("skip_no_plaintext");
  });

  it("平文が4桁数字でない不正データは skip_invalid（ハッシュ化しない）", () => {
    for (const bad of ["12", "abcd", "12345", "12a4"]) {
      const r = planPhoneHashBackfill(
        { tenant_id: "t1", customer_phone_last4: bad, customer_phone_last4_hash: null },
        fakeHash,
      );
      expect(r.action).toBe("skip_invalid");
      expect(r.hash).toBeUndefined();
    }
  });

  it("前後空白を除去して4桁判定する", () => {
    const r = planPhoneHashBackfill(
      { tenant_id: "t1", customer_phone_last4: " 1234 ", customer_phone_last4_hash: null },
      fakeHash,
    );
    expect(r).toEqual({ action: "hash", hash: "HASH(t1:1234)" });
  });
});
