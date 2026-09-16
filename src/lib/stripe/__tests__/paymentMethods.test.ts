/**
 * Connect アカウント作成時の決済手段の同時申請の検証。
 *
 * 守りたいこと:
 *  0. **選ばれていない決済手段を勝手に申請しない**（Ledra から強制しない）
 *  1. 選ばれた分は作成時にまとめて申請する（加盟店の手続きを1回で終える）
 *  2. 通らない capability があっても**アカウント接続そのものは成功する**。
 *     しかも通らなかった分だけ外す（1つの巻き添えで全部落とさない）
 *  3. 一度断られた capability を毎回投げ直さない
 *     （400 の連発で共有の circuit breaker が開くと、接続そのものが 500 になる）
 *  4. 決済手段と無関係な失敗は握り潰さない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

import {
  createAccountWithCapabilities,
  OPTIONAL_CAPABILITY_IDS,
  __resetCapabilityMemoForTest,
} from "@/lib/stripe/paymentMethods";

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
  // プロセス内メモはテストをまたいで残る。消さないと後続のテストが
  // 「一度も要求しなかった」ことを検証してしまう（実際に素通りしていた）
  beforeEach(() => __resetCapabilityMemoForTest());

  it("何も選ばれていなければ、追加の申請はしない", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "acct_0" }));

    const { account } = await createAccountWithCapabilities(stripe, PARAMS);

    expect(account.id).toBe("acct_0");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].capabilities).toBeUndefined();
  });

  it("選ばれた決済手段だけを作成と同時に要求する", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "acct_1" }));

    const { account } = await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);

    expect(account.id).toBe("acct_1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(requested(create.mock.calls[0][0])).toEqual([...OPTIONAL_CAPABILITY_IDS]);
    expect(create.mock.calls[0][0].country).toBe("JP"); // 呼び出し側のパラメータは維持
  });

  it("許可リストに無い capability は要求しない（渡された値をそのまま Stripe に送らない）", async () => {
    const { stripe, create } = fakeStripe(() => ({ id: "acct_x" }));

    await createAccountWithCapabilities(stripe, PARAMS, ["card_issuing", "treasury"]);

    expect(create.mock.calls[0][0].capabilities).toBeUndefined();
  });

  it("通らない capability だけを外して作る（1つの巻き添えで全部落とさない）", async () => {
    const { stripe, create } = fakeStripe((params) =>
      requested(params).includes("paypay_payments")
        ? stripeError("paypay_payments is not a valid capability", "capabilities")
        : { id: "acct_2" },
    );

    const { account } = await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);

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

    await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);
    create.mockClear();
    const { account } = await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);

    expect(account.id).toBe("acct_3");
    expect(create).toHaveBeenCalledTimes(1);
    expect(requested(create.mock.calls[0][0])).not.toContain("paypay_payments");
  });

  it("どれが悪いか特定できないときは、正常な申請まで無効と記録しない", async () => {
    let calls = 0;
    const { stripe, create } = fakeStripe(() =>
      calls++ === 0 ? stripeError("capabilities is invalid", "capabilities") : { id: "acct_4" },
    );

    await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);
    create.mockClear();
    calls = 1; // 2 回目は成功させる
    await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);

    // 巻き添えで外した分は覚えない → 次はまた全部要求する
    expect(requested(create.mock.calls[0][0])).toEqual([...OPTIONAL_CAPABILITY_IDS]);
  });

  it("上限に達して残りをまとめて外しても、断られていない手段を「無効」と記録しない", async () => {
    // konbini → jp_bank_transfer と2回断られ、3回目は上限で残り（paypay / link）も外れる
    const rejectOrder = ["konbini_payments", "jp_bank_transfer_payments"];
    let round = 0;
    const { stripe, create } = fakeStripe((params) => {
      const caps = requested(params);
      const target = rejectOrder[round];
      if (target && caps.includes(target)) {
        round++;
        return stripeError(`${target} is not a valid capability`, "capabilities");
      }
      return { id: "acct_bulk" };
    });

    await createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS]);

    // 次の店が PayPay と Link を選んだら、ちゃんと要求される
    create.mockClear();
    round = 99; // もう断らない
    await createAccountWithCapabilities(stripe, PARAMS, ["paypay_payments", "link_payments"]);

    expect(requested(create.mock.calls[0][0])).toEqual(["paypay_payments", "link_payments"]);
  });

  it("要求できた手段を返す（選んだのに出せなかった分を画面が知れる）", async () => {
    const { stripe } = fakeStripe((params) =>
      requested(params).includes("paypay_payments")
        ? stripeError("paypay_payments is not a valid capability", "capabilities")
        : { id: "acct_r" },
    );

    const first = await createAccountWithCapabilities(stripe, PARAMS, ["paypay_payments", "link_payments"]);
    expect(first.requested).toEqual(["link_payments"]);

    // 2 回目は最初から要求しない → 返り値にも出ない
    const second = await createAccountWithCapabilities(stripe, PARAMS, ["paypay_payments", "link_payments"]);
    expect(second.requested).toEqual(["link_payments"]);
  });

  it("特定できない失敗はそのまま投げる", async () => {
    const { stripe, create } = fakeStripe(() => stripeError("country is not supported"));

    await expect(createAccountWithCapabilities(stripe, PARAMS, [...OPTIONAL_CAPABILITY_IDS])).rejects.toThrow(
      "country is not supported",
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
