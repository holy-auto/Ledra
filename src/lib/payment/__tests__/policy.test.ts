import { describe, it, expect } from "vitest";
import { evaluatePaymentPolicy, resolvePaymentPolicy, isBlindRetryBlocked } from "../policy";
import type { PaymentPolicyContext } from "../types";
import type { PaymentState } from "@/lib/domain/states";
import { PAYMENT_STATES } from "@/lib/domain/states";

describe("resolvePaymentPolicy", () => {
  it("individual → consumer", () => {
    expect(resolvePaymentPolicy({ customerType: "individual" })).toBe("consumer");
  });
  it("corporate → b2b", () => {
    expect(resolvePaymentPolicy({ customerType: "corporate" })).toBe("b2b");
  });
  it("insurerApproved 指定 → insurance", () => {
    expect(resolvePaymentPolicy({ customerType: "individual", insurerApproved: true })).toBe("insurance");
  });
});

describe("evaluatePaymentPolicy — consumer", () => {
  const base: PaymentPolicyContext = {
    customerType: "individual",
    billingCycle: null,
    paymentState: "UNPAID",
  };

  it("PAID → met", () => {
    expect(evaluatePaymentPolicy({ ...base, paymentState: "PAID" })).toEqual({
      policy: "consumer",
      met: true,
    });
  });

  it("OVERPAID → met", () => {
    expect(evaluatePaymentPolicy({ ...base, paymentState: "OVERPAID" })).toEqual({
      policy: "consumer",
      met: true,
    });
  });

  it("UNPAID → not met", () => {
    const result = evaluatePaymentPolicy(base);
    expect(result.met).toBe(false);
    expect(result.reason).toContain("お会計が完了していません");
  });

  it("PENDING → not met with pending message", () => {
    const result = evaluatePaymentPolicy({ ...base, paymentState: "PENDING" });
    expect(result.met).toBe(false);
    expect(result.reason).toContain("決済処理中");
  });

  it("UNKNOWN → not met with UNKNOWN message", () => {
    const result = evaluatePaymentPolicy({ ...base, paymentState: "UNKNOWN" });
    expect(result.met).toBe(false);
    expect(result.reason).toContain("決済結果が不明");
  });
});

describe("evaluatePaymentPolicy — b2b", () => {
  const base: PaymentPolicyContext = {
    customerType: "corporate",
    billingCycle: "per_job",
    paymentState: "UNPAID",
  };

  it("consolidated → always met", () => {
    const result = evaluatePaymentPolicy({ ...base, billingCycle: "consolidated", paymentState: "UNPAID" });
    expect(result).toEqual({ policy: "b2b", met: true });
  });

  it("billingCycle null → not met, 設定促進", () => {
    const result = evaluatePaymentPolicy({ ...base, billingCycle: null });
    expect(result.met).toBe(false);
    expect(result.reason).toContain("支払いサイクルが未設定");
  });

  it("per_job + PAID → met", () => {
    expect(evaluatePaymentPolicy({ ...base, paymentState: "PAID" }).met).toBe(true);
  });

  it("per_job + UNPAID → not met", () => {
    const result = evaluatePaymentPolicy(base);
    expect(result.met).toBe(false);
    expect(result.reason).toContain("都度払い");
  });
});

describe("evaluatePaymentPolicy — insurance", () => {
  const base: PaymentPolicyContext = {
    customerType: "individual",
    billingCycle: null,
    paymentState: "UNPAID",
    insurerApproved: false,
  };

  it("insurerApproved → met", () => {
    expect(evaluatePaymentPolicy({ ...base, insurerApproved: true }).met).toBe(true);
  });

  it("not approved → not met", () => {
    const result = evaluatePaymentPolicy(base);
    expect(result.met).toBe(false);
    expect(result.reason).toContain("保険会社の承認");
  });

  it("承認済みでも決済状態が UNKNOWN なら不成立(盲目リトライ禁止)", () => {
    const result = evaluatePaymentPolicy({ ...base, insurerApproved: true, paymentState: "UNKNOWN" });
    expect(result.met).toBe(false);
    expect(result.reason).toContain("決済結果が不明");
  });

  it("承認済みでも決済状態が CANCELED なら不成立", () => {
    const result = evaluatePaymentPolicy({ ...base, insurerApproved: true, paymentState: "CANCELED" });
    expect(result.met).toBe(false);
    expect(result.reason).toContain("取り消され");
  });
});

describe("isBlindRetryBlocked", () => {
  it("UNKNOWN → true", () => expect(isBlindRetryBlocked("UNKNOWN")).toBe(true));

  it("他の状態 → false", () => {
    const nonUnknown = PAYMENT_STATES.filter((s) => s !== "UNKNOWN");
    for (const s of nonUnknown) {
      expect(isBlindRetryBlocked(s as PaymentState)).toBe(false);
    }
  });
});

describe("UNKNOWN からの盲目リトライ禁止", () => {
  it("都度払い・consumer・insurance で UNKNOWN は不成立", () => {
    const contexts: PaymentPolicyContext[] = [
      { customerType: "individual", billingCycle: null, paymentState: "UNKNOWN" },
      { customerType: "corporate", billingCycle: "per_job", paymentState: "UNKNOWN" },
      { customerType: "individual", billingCycle: null, paymentState: "UNKNOWN", insurerApproved: false },
      { customerType: "individual", billingCycle: null, paymentState: "UNKNOWN", insurerApproved: true },
    ];
    for (const ctx of contexts) {
      expect(evaluatePaymentPolicy(ctx).met).toBe(false);
    }
  });

  it("合算払い(consolidated) は UNKNOWN でも成立（後日請求なので決済状態は無関係）", () => {
    const result = evaluatePaymentPolicy({
      customerType: "corporate",
      billingCycle: "consolidated",
      paymentState: "UNKNOWN",
    });
    expect(result.met).toBe(true);
  });

  it("合算払い(consolidated) は CANCELED でも成立する（現状の実装。要確認 — OPEN_QUESTIONS.md 参照）", () => {
    // モジュールの JSDoc は、合算払い（consolidated）が paymentState を一切見ない例外
    // であることを明記済み（＝ここは JSDoc と実装が矛盾しているわけではない）。
    // 未解決なのは、この例外が CANCELED にも及ぶのが正しい設計かどうかという
    // 製品判断（OPEN_QUESTIONS.md 参照）。回帰テストとして現状の挙動を明示する。
    const result = evaluatePaymentPolicy({
      customerType: "corporate",
      billingCycle: "consolidated",
      paymentState: "CANCELED",
    });
    expect(result.met).toBe(true);
  });
});
