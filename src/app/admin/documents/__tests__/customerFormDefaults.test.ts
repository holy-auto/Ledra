import { describe, it, expect } from "vitest";
import { customerFormDefaults } from "../DocumentForm";

/**
 * 顧客登録で入力した支払条件が、請求書（新規帳票）の支払条件へ反映されることを守る。
 * このロジックは顧客選択(onChange)と URL プリフィル(請求書を作成ボタン)の双方で共有される。
 */
describe("customerFormDefaults", () => {
  const base = {
    honorific: "様" as const,
    postal_code: "123-4567",
    address: "東京都千代田区1-1",
    phone: "03-1234-5678",
    billing_cycle: null,
    billing_terms_note: null,
  };

  it("支払い条件メモがあればそれを支払条件に反映する", () => {
    const d = customerFormDefaults({ ...base, billing_terms_note: "月末締翌月末払" });
    expect(d.payment_terms).toBe("月末締翌月末払");
    expect(d.honorific).toBe("様");
    expect(d.postal_code).toBe("123-4567");
    expect(d.address).toBe("東京都千代田区1-1");
    expect(d.phone).toBe("03-1234-5678");
  });

  it("メモが無ければ支払サイクルのラベルにフォールバックする", () => {
    expect(customerFormDefaults({ ...base, billing_cycle: "consolidated" }).payment_terms).toBe("合算（締め払い）");
    expect(customerFormDefaults({ ...base, billing_cycle: "per_job" }).payment_terms).toBe("都度払い");
  });

  it("支払条件が未設定なら空文字（宛先情報は null を空文字へ寄せる）", () => {
    const d = customerFormDefaults({
      honorific: null,
      postal_code: null,
      address: null,
      phone: null,
      billing_cycle: null,
      billing_terms_note: null,
    });
    expect(d.payment_terms).toBe("");
    expect(d.honorific).toBe("御中");
    expect(d.postal_code).toBe("");
  });
});
