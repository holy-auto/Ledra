/**
 * Connect アカウント作成時の PayPay 同時申請の検証。
 *
 * 守りたいこと:
 *  1. 作成時に PayPay の capability を要求する（加盟店の手続きを1回で終わらせる）
 *  2. 要求が通らない環境でも**アカウント接続そのものは成功する**
 *     （ここで落とすと加盟店が決済を繋げられない）
 *  3. PayPay と無関係な失敗は握り潰さない
 */
import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";

import { createAccountRequestingPaypay, PAYPAY_CAPABILITY } from "@/lib/stripe/paypay";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** SDK が実際に投げる形のエラーを作る。 */
function stripeError(type: string, message: string, param?: string) {
  return Stripe.errors.StripeError.generate({ type, message, param } as never);
}

function fakeStripe(impl: (params: Stripe.AccountCreateParams) => unknown) {
  const create = vi.fn(async (params: Stripe.AccountCreateParams) => {
    const out = impl(params);
    if (out instanceof Error) throw out;
    return out;
  });
  return { stripe: { accounts: { create } } as unknown as Stripe, create };
}

const PARAMS: Stripe.AccountCreateParams = { type: "standard", country: "JP" };
const requestsPaypay = (params: Stripe.AccountCreateParams) =>
  (params.capabilities as Record<string, { requested?: boolean }> | undefined)?.[PAYPAY_CAPABILITY]?.requested === true;

describe("createAccountRequestingPaypay", () => {
  it("作成と同時に PayPay の capability を要求する", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "acct_1" }));

    const account = await createAccountRequestingPaypay(stripe, PARAMS);

    expect(account.id).toBe("acct_1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(requestsPaypay(create.mock.calls[0][0])).toBe(true);
    // 呼び出し側のパラメータは維持する
    expect(create.mock.calls[0][0].country).toBe("JP");
  });

  it("PayPay を要求できない環境でも、PayPay 抜きでアカウントを作る", async () => {
    const { stripe, create } = fakeStripe((params) =>
      requestsPaypay(params)
        ? stripeError("invalid_request_error", "paypay_payments is not a valid capability", "capabilities")
        : { id: "acct_2" },
    );

    const account = await createAccountRequestingPaypay(stripe, PARAMS);

    expect(account.id).toBe("acct_2");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].capabilities).toBeUndefined();
  });

  it("PayPay と無関係な失敗はそのまま投げる", async () => {
    const { stripe, create } = fakeStripe(() => stripeError("invalid_request_error", "country is not supported"));

    await expect(createAccountRequestingPaypay(stripe, PARAMS)).rejects.toThrow("country is not supported");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
