/**
 * 店頭 QR 会計の決済手段選択の検証。
 *
 * 守りたいこと:
 *  1. PayPay 未有効化の店でも**会計が落ちない**（カードのみで作り直す）
 *  2. その判定が**実際に stripe-node が投げるエラー**で成立すること
 *     （`.type` はクラス名、`.rawType` が API の型。片方だけ見ると判定が死ぬ）
 *  3. PayPay の金額上限・下限を外れた会計に PayPay を出さない
 *  4. PayPay 以外の失敗を握り潰さない（本当のエラーが消えると原因が追えない）
 */
import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";

import { createPosCheckoutSession } from "@/lib/stripe/posCheckoutSession";
import { PAYPAY_MAX_JPY, PAYPAY_MIN_JPY } from "@/lib/stripe/paypay";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** SDK が実際に投げる形のエラーを作る（手書きの平オブジェクトでは判定を検証できない）。 */
function stripeError(type: string, message: string, param?: string) {
  return Stripe.errors.StripeError.generate({ type, message, param } as never);
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
const offersPaypay = (params: Stripe.Checkout.SessionCreateParams) =>
  (params.payment_method_types as string[] | undefined)?.includes("paypay") ?? false;

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
      offersPaypay(params)
        ? stripeError(
            "invalid_request_error",
            "The payment method type provided: paypay is invalid.",
            "payment_method_types[1]",
          )
        : { id: "cs_2" },
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

  it("未知のアカウントを同時に探らない（400 の連発で共有の circuit breaker を開けない）", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    const { stripe, create } = fakeStripe(() => ({ id: "cs_3" }));
    const slow = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
      if (offersPaypay(params)) await gate;
      return { id: "cs_3" };
    });
    (stripe.checkout.sessions as unknown as { create: typeof slow }).create = slow;

    const first = createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_slow" });
    const second = await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_slow" });
    release!();
    await first;

    // 探り中に入った会計はカードのみで通す（PayPay が出ないだけで止まらない）
    expect(second.id).toBe("cs_3");
    expect(slow.mock.calls[1][0].payment_method_types).toEqual(["card"]);
    expect(create).not.toHaveBeenCalled();
  });

  it("capability のエラーを PayPay 非対応と誤読しない（権限を絞られた店から PayPay が消える）", async () => {
    const { stripe, create } = fakeStripe(() =>
      stripeError("invalid_request_error", "This account is missing required capabilities", "capabilities"),
    );

    await expect(
      createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_restricted" }),
    ).rejects.toThrow("missing required capabilities");
    // カードのみで投げ直さない（同じ失敗を2回出すだけ）
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("PayPay と無関係な失敗はそのまま投げる", async () => {
    const { stripe, create } = fakeStripe(() =>
      stripeError("invalid_request_error", "account is not enabled for charges"),
    );

    await expect(createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_broken" })).rejects.toThrow(
      "not enabled for charges",
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
