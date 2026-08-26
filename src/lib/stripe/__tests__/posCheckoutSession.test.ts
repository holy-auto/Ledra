/**
 * 店頭 QR 会計の決済手段選択の検証。
 *
 * 守りたいこと:
 *  1. PayPay 未有効化の店でも**会計が落ちない**（カードのみで作り直す）
 *  2. PayPay の金額上限・下限を外れた会計に PayPay を出さない
 *  3. PayPay 以外の失敗を握り潰さない（本当のエラーが消えると原因が追えない）
 */
import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

import { createPosCheckoutSession, PAYPAY_MAX_JPY, PAYPAY_MIN_JPY } from "@/lib/stripe/posCheckoutSession";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function paypayRejection() {
  return Object.assign(new Error("The payment method type provided: paypay is invalid."), {
    type: "invalid_request_error",
    param: "payment_method_types[1]",
  });
}

/** `create` の呼び出しを記録するだけの Stripe ダブル。 */
function fakeStripe(impl: (params: Stripe.Checkout.SessionCreateParams) => unknown) {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    const out = impl(params);
    if (out instanceof Error) throw out;
    return out;
  });
  return { stripe: { checkout: { sessions: { create } } } as unknown as Stripe, create };
}

const PARAMS = { mode: "payment" as const, line_items: [] };

describe("createPosCheckoutSession", () => {
  it("PayPay が使える金額なら card + paypay を提示する", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "cs_1" }));

    await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_ok" });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].payment_method_types).toEqual(["card", "paypay"]);
  });

  it("PayPay の上限・下限を外れたらカードのみ", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "cs_1" }));

    await createPosCheckoutSession(stripe, PAYPAY_MAX_JPY + 1, PARAMS, { stripeAccount: "acct_limit" });
    await createPosCheckoutSession(stripe, PAYPAY_MIN_JPY - 1, PARAMS, { stripeAccount: "acct_limit" });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].payment_method_types).toEqual(["card"]);
    expect(create.mock.calls[1][0].payment_method_types).toEqual(["card"]);
  });

  it("PayPay 未有効化の店ではカードのみで作り直し、以後は 1 回で作る", async () => {
    const { stripe, create } = fakeStripe((params) =>
      // SDK の型に paypay がまだ無いので string として見る
      (params.payment_method_types as string[] | undefined)?.includes("paypay") ? paypayRejection() : { id: "cs_2" },
    );

    const first = await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_no_paypay" });
    expect(first.id).toBe("cs_2");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].payment_method_types).toEqual(["card"]);

    // 2 回目は PayPay を試さない（毎回 1 往復無駄にしない）
    create.mockClear();
    await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_no_paypay" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].payment_method_types).toEqual(["card"]);
  });

  it("PayPay と無関係な失敗はそのまま投げる", async () => {
    const { stripe, create } = fakeStripe(() =>
      Object.assign(new Error("account is not enabled for charges"), { type: "invalid_request_error" }),
    );

    await expect(createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_broken" })).rejects.toThrow(
      "not enabled for charges",
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
