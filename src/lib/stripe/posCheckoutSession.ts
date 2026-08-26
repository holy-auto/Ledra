/**
 * 店頭 QR 会計（POS）の Checkout Session を作る共通ヘルパ。
 *
 * なぜ要るか: 店頭の QR 会計は `payment_method_types: ["card"]` 固定で、
 * 「QRを見せてカードで払ってもらう」ものだった。カード以外（PayPay・Alipay・
 * WeChat Pay）も、**その店で有効化されているものだけ**自動で出るようにする。
 *
 * どの手段が使えるかは Stripe 側の店舗ごとの審査次第で、Ledra からは確定
 * できない。そこで「付けて出して、断られた手段だけ外して作り直す」形にし
 * （`withOptionalExtras`）、結果をプロセス内におぼえて往復を減らす。
 *
 * 決済手段を明示列挙しているのは意図的。dynamic payment methods に任せると
 * コンビニ払い・銀行振込のような**非同期決済**が候補に出てしまい、レジの
 * ポーリングが永久に paid にならない（客は帰った、売上は立たない）。
 */
import type Stripe from "stripe";

import { OPTIONAL_POS_METHODS, withOptionalExtras } from "@/lib/stripe/paymentMethods";

/**
 * ponytail: 「この店でこの手段が使えるか」のプロセス内メモ。毎回1往復無駄に
 * しないためだけのもので、真実は常に Stripe 側にある（TTL 経過後にまた試すので、
 * 審査が通れば遅くとも TTL 後には出る）。
 * 上限: インスタンス単位でしか効かない。恒久的にしたいなら `account.updated`
 * webhook で capabilities を tenants に同期して、この推測を捨てる。
 */
const SUPPORTED_TTL_MS = 60 * 60_000;
const UNSUPPORTED_TTL_MS = 10 * 60_000;
const support = new Map<string, { supported: boolean; until: number }>();

/**
 * まだ試したことのない手段の「探り」は、同時に 1 件までにする。
 *
 * なぜ要るか: 未有効化の手段を付けた作成は 400 で落ちる。`getStripeClient()` の
 * 全呼び出しは `withRetry("stripe", ...)` を通っており、**非リトライ対象の失敗も
 * circuit breaker の連続失敗に数えられる**（5連続で30秒 open → 請求書も Connect も
 * 巻き添え）。探りを1件に絞れば、直後の作り直し（成功）がカウンタを 0 に戻す。
 */
let probing = false;

function accountKey(options?: Stripe.RequestOptions): string {
  return options?.stripeAccount ?? "platform";
}

function knownSupport(account: string, method: string): boolean | undefined {
  const memo = support.get(`${account}:${method}`);
  if (memo === undefined || memo.until <= Date.now()) return undefined;
  return memo.supported;
}

function remember(account: string, method: string, supported: boolean): void {
  support.set(`${account}:${method}`, {
    supported,
    until: Date.now() + (supported ? SUPPORTED_TTL_MS : UNSUPPORTED_TTL_MS),
  });
}

/** WeChat Pay は Checkout で `client` の指定が必須（未指定だと作成が落ちる）。 */
function optionsForMethods(methods: string[]): Pick<Stripe.Checkout.SessionCreateParams, "payment_method_options"> {
  return methods.includes("wechat_pay") ? { payment_method_options: { wechat_pay: { client: "web" } } } : {};
}

/**
 * POS 用の Checkout Session を作る。`payment_method_types` は呼び出し側では
 * 指定しない（ここが決める）。
 */
export async function createPosCheckoutSession(
  stripe: Stripe,
  amountJpy: number,
  params: Omit<Stripe.Checkout.SessionCreateParams, "payment_method_types">,
  options?: Stripe.RequestOptions,
): Promise<Stripe.Checkout.Session> {
  const account = accountKey(options);

  // 実績のある手段は毎回出す。未知の手段は 1 回の会計につき 1 つだけ探る
  // （探り中の同時会計は既知の手段だけで通す。出ない手段があるだけで会計は止まらない）
  let exploring: string | null = null;
  const extras: string[] = [];
  for (const method of OPTIONAL_POS_METHODS) {
    if (method.eligible && !method.eligible(amountJpy)) continue;
    const state = knownSupport(account, method.type);
    if (state === true) extras.push(method.type);
    else if (state === undefined && !probing && exploring === null) {
      extras.push(method.type);
      exploring = method.type;
    }
  }

  if (exploring !== null) probing = true;
  try {
    const { value, extras: used } = await withOptionalExtras(
      extras,
      (methods) =>
        stripe.checkout.sessions.create(
          {
            ...params,
            payment_method_types: ["card", ...(methods as Stripe.Checkout.SessionCreateParams.PaymentMethodType[])],
            ...optionsForMethods(methods),
          },
          options,
        ),
      {
        scope: "payment_method",
        // 送っているのは ["card", ...候補]。位置での名指しを正しく読むため
        indexBase: 1,
        // **恒久的な理由でないものを実績にしない。**
        //  - 金額制限: その会計で出せなかっただけ。次の会計では出せる
        //  - bulk（どれが悪いか特定できず全部外した）: 実績のある手段まで
        //    巻き添えで消さない。ただし**今回足した未知の手段**は、それが
        //    原因である可能性が高いので記録する（でないと毎回1往復無駄になる）
        onDrop: (method, info) => {
          if (/amount|minimum|maximum|limit|too (small|large)/i.test(info.message)) return;
          if (info.bulk && method !== exploring) return;
          remember(account, method, false);
        },
      },
    );
    used.forEach((method) => remember(account, method, true));
    return value;
  } finally {
    if (exploring !== null) probing = false;
  }
}

/** テスト専用 —— プロセス内メモを消す。 */
export function __resetSupportMemoForTest(): void {
  support.clear();
  probing = false;
}
