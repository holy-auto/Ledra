/**
 * 店頭 QR 会計の決済手段選択の検証。
 *
 * 守りたいこと:
 *  1. その店で使える手段だけを出し、**使えない手段があっても会計は落ちない**
 *  2. 断られた手段だけを外す（PayPay が使える店から Alipay の巻き添えで PayPay を消さない）
 *  3. その判定が**実際に stripe-node が投げるエラー**で成立すること
 *     （`.type` はクラス名、`.rawType` が API の型。片方だけ見ると判定が死ぬ）
 *  4. WeChat Pay には Checkout 必須の `client` を付ける
 *  5. PayPay の金額上限・下限を外れた会計に PayPay を出さない
 *  6. 決済手段と無関係な失敗を握り潰さない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

import { createPosCheckoutSession, __resetSupportMemoForTest } from "@/lib/stripe/posCheckoutSession";
import { PAYPAY_MAX_JPY, PAYPAY_MIN_JPY } from "@/lib/stripe/paymentMethods";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function stripeError(message: string, param?: string) {
  return Stripe.errors.StripeError.generate({ type: "invalid_request_error", message, param } as never);
}

function fakeStripe(impl: (params: Stripe.Checkout.SessionCreateParams) => unknown) {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    const out = impl(params);
    if (out instanceof Error) throw out;
    return out;
  });
  return { stripe: { checkout: { sessions: { create } } } as unknown as Stripe, create };
}

const PARAMS = { mode: "payment" as const, line_items: [] };
const methodsOf = (params: Stripe.Checkout.SessionCreateParams) => (params.payment_method_types ?? []) as string[];

/** 1回の会計で探れる未知の手段は1つ。全部の実績が付くまで会計を繰り返す。 */
async function settle(stripe: Stripe, account: string, rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: account });
  }
}

describe("createPosCheckoutSession", () => {
  beforeEach(() => __resetSupportMemoForTest());

  it("全部使える店では card + PayPay + Alipay + WeChat Pay を提示する", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "cs_1" }));

    await settle(stripe, "acct_all");

    expect(methodsOf(create.mock.calls.at(-1)![0])).toEqual(["card", "paypay", "alipay", "wechat_pay"]);
  });

  it("WeChat Pay を出すときは Checkout 必須の client を付ける", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "cs_1" }));

    await settle(stripe, "acct_wechat");

    expect(create.mock.calls.at(-1)![0].payment_method_options?.wechat_pay).toEqual({ client: "web" });
  });

  it("断られた手段だけを外す（PayPay は残す）", async () => {
    const { stripe, create } = fakeStripe((params) =>
      methodsOf(params).includes("alipay")
        ? stripeError("The payment method type provided: alipay is invalid", "payment_method_types[2]")
        : { id: "cs_2" },
    );

    await settle(stripe, "acct_no_alipay");

    const last = methodsOf(create.mock.calls.at(-1)![0]);
    expect(last).toContain("paypay");
    expect(last).not.toContain("alipay");
  });

  it("何も使えない店でもカードで会計できる", async () => {
    const { stripe, create } = fakeStripe((params) =>
      methodsOf(params).length > 1
        ? stripeError("payment_method_types is invalid", "payment_method_types")
        : { id: "cs_3" },
    );

    const session = await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_card_only" });

    expect(session.id).toBe("cs_3");
    expect(methodsOf(create.mock.calls.at(-1)![0])).toEqual(["card"]);

    // 未知の手段は 1 会計につき 1 つずつ探るので、数回で全部に実績が付く。
    // 以降は探り直さない（毎回 1 往復無駄にしない）
    await settle(stripe, "acct_card_only");
    create.mockClear();
    await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_card_only" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(methodsOf(create.mock.calls[0][0])).toEqual(["card"]);
  });

  it("PayPay の上限・下限を外れたら PayPay を出さない", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "cs_4" }));

    await createPosCheckoutSession(stripe, PAYPAY_MAX_JPY + 1, PARAMS, { stripeAccount: "acct_limit" });
    await createPosCheckoutSession(stripe, PAYPAY_MIN_JPY - 1, PARAMS, { stripeAccount: "acct_limit" });

    expect(methodsOf(create.mock.calls[0][0])).not.toContain("paypay");
    expect(methodsOf(create.mock.calls[1][0])).not.toContain("paypay");
  });

  it("未知の手段を同時に探らない（400 の連発で共有の circuit breaker を開けない）", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    const { stripe, create } = fakeStripe(() => ({ id: "cs_5" }));
    const slow = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
      if (methodsOf(params).length > 1) await gate;
      return { id: "cs_5" };
    });
    (stripe.checkout.sessions as unknown as { create: typeof slow }).create = slow;

    const first = createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_slow" });
    const second = await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_slow" });
    release!();
    await first;

    // 探り中に入った会計はカードのみで通す（手段が出ないだけで会計は止まらない）
    expect(second.id).toBe("cs_5");
    expect(methodsOf(slow.mock.calls[1][0])).toEqual(["card"]);
    expect(create).not.toHaveBeenCalled();
  });

  it("特定できない 400 で、実績のある手段まで消さない", async () => {
    let failNext = false;
    const { stripe, create } = fakeStripe((params) => {
      // 「card, alipay, wechat_pay のいずれかにしろ」という選択肢の列挙。
      // 候補が複数出るので「どれが悪いか」は特定できない
      if (failNext && methodsOf(params).length > 1) {
        failNext = false;
        return stripeError("payment_method_types must be one of card, alipay, wechat_pay", "payment_method_types");
      }
      return { id: "cs_6" };
    });

    await settle(stripe, "acct_enum"); // 3 手段とも実績が付く
    failNext = true;
    await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_enum" });

    // 巻き添えで実績を消さない → 次の会計でも 3 手段を提示する
    await createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_enum" });
    expect(methodsOf(create.mock.calls.at(-1)![0])).toEqual(["card", "paypay", "alipay", "wechat_pay"]);
  });

  it("金額制限で断られた手段を「その店では使えない」と記録しない", async () => {
    let rejected = false;
    const { stripe, create } = fakeStripe((params) => {
      if (methodsOf(params).includes("alipay") && !rejected) {
        rejected = true;
        return stripeError("Amount must be no more than the maximum for alipay", "payment_method_types[2]");
      }
      return { id: "cs_7" };
    });

    await settle(stripe, "acct_amount");

    expect(methodsOf(create.mock.calls.at(-1)![0])).toContain("alipay");
  });

  it("特定できない失敗はそのまま投げる（カードのみで投げ直さない）", async () => {
    const { stripe, create } = fakeStripe(() => stripeError("This account is missing required capabilities"));

    await expect(
      createPosCheckoutSession(stripe, 10_000, PARAMS, { stripeAccount: "acct_restricted" }),
    ).rejects.toThrow("missing required capabilities");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
