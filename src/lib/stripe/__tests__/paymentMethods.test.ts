/**
 * Connect アカウント作成時の決済手段の同時申請の検証。
 *
 * 守りたいこと:
 *  1. 使える決済手段の申請を作成時にまとめて出す（加盟店の手続きを1回で終える）
 *  2. 通らない capability があっても**アカウント接続そのものは成功する**。
 *     しかも通らなかった分だけ外す（1つの巻き添えで全部落とさない）
 *  3. 一度断られた capability を毎回投げ直さない
 *     （400 の連発で共有の circuit breaker が開くと、接続そのものが 500 になる）
 *  4. 決済手段と無関係な失敗は握り潰さない
 */
import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";

import { createAccountWithCapabilities, REQUESTED_CAPABILITIES } from "@/lib/stripe/paymentMethods";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** SDK が実際に投げる形のエラーを作る（手書きの平オブジェクトでは判定を検証できない）。 */
function stripeError(message: string, param?: string) {
  return Stripe.errors.StripeError.generate({ type: "invalid_request_error", message, param } as never);
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
const requested = (params: Stripe.AccountCreateParams) => Object.keys(params.capabilities ?? {});

describe("createAccountWithCapabilities", () => {
  it("作成と同時に決済手段の capability をまとめて要求する", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "acct_1" }));

    const account = await createAccountWithCapabilities(stripe, PARAMS);

    expect(account.id).toBe("acct_1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(requested(create.mock.calls[0][0])).toEqual([...REQUESTED_CAPABILITIES]);
    expect(create.mock.calls[0][0].country).toBe("JP"); // 呼び出し側のパラメータは維持
  });

  it("通らない capability だけを外して作る（1つの巻き添えで全部落とさない）", async () => {
    const { stripe, create } = fakeStripe((params) =>
      requested(params).includes("paypay_payments")
        ? stripeError("paypay_payments is not a valid capability", "capabilities")
        : { id: "acct_2" },
    );

    const account = await createAccountWithCapabilities(stripe, PARAMS);

    expect(account.id).toBe("acct_2");
    expect(create).toHaveBeenCalledTimes(2);
    expect(requested(create.mock.calls[1][0])).toEqual([
      "konbini_payments",
      "jp_bank_transfer_payments",
      "link_payments",
    ]);
  });

  it("一度断られた capability は次から要求しない", async () => {
    const { stripe, create } = fakeStripe((params) =>
      requested(params).includes("paypay_payments")
        ? stripeError("paypay_payments is not a valid capability", "capabilities")
        : { id: "acct_3" },
    );

    await createAccountWithCapabilities(stripe, PARAMS);
    create.mockClear();
    const account = await createAccountWithCapabilities(stripe, PARAMS);

    expect(account.id).toBe("acct_3");
    expect(create).toHaveBeenCalledTimes(1);
    expect(requested(create.mock.calls[0][0])).not.toContain("paypay_payments");
  });

  it("特定できない失敗はそのまま投げる", async () => {
    const { stripe, create } = fakeStripe(() => stripeError("country is not supported"));

    await expect(createAccountWithCapabilities(stripe, PARAMS)).rejects.toThrow("country is not supported");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
