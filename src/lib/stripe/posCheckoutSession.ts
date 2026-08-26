/**
 * 店頭 QR 会計（POS）の Checkout Session を作る共通ヘルパ。
 *
 * なぜ要るか: 店頭の QR 会計は `payment_method_types: ["card"]` 固定で、
 * 「QRを見せてカードで払ってもらう」ものだった。Stripe が PayPay に対応したので、
 * **PayPay を有効化した施工店では QR から PayPay も選べる**ようにする。
 *
 * ただし PayPay は Stripe 側で店舗ごとの申請・審査が要る。有効化していない
 * アカウントに `paypay` を渡すと Session 作成が 400 で落ちるので、**落ちたら
 * カードのみで作り直す**。これで、有効化済みの店だけが自動的に PayPay を出せる
 * （Ledra 側の設定・マイグレーションは不要で、審査が通った瞬間に切り替わる）。
 *
 * 決済手段を明示列挙しているのは意図的。dynamic payment methods に任せると
 * コンビニ払い・銀行振込のような**非同期決済**が候補に出てしまい、レジの
 * ポーリングが永久に paid にならない（客は帰った、売上は立たない）。
 * ここに足してよいのは即時確定する手段だけ。
 */
import type Stripe from "stripe";

import { logger } from "@/lib/logger";
import { isPaypayRejection, PAYPAY_MAX_JPY, PAYPAY_METHOD, PAYPAY_MIN_JPY } from "@/lib/stripe/paypay";

/**
 * ponytail: PayPay を出せるアカウントかどうかのプロセス内メモ。毎回 1 往復
 * 無駄にしないためだけのもので、真実は常に Stripe 側にある（TTL 経過後に
 * また試すので、審査が通れば遅くとも TTL 後には PayPay が出る）。
 * 上限: インスタンス単位でしか効かない。恒久的にしたいなら `account.updated`
 * webhook で `capabilities.paypay_payments` を tenants に同期して、この推測を捨てる。
 */
const SUPPORTED_TTL_MS = 60 * 60_000;
const UNSUPPORTED_TTL_MS = 10 * 60_000;
const paypaySupport = new Map<string, { supported: boolean; until: number }>();

/**
 * 未知のアカウントを「探る」呼び出しは同時に 1 件までにする。
 *
 * なぜ要るか: 未有効化アカウントへの `paypay` 付き作成は 400 で落ちる。
 * `getStripeClient()` の全呼び出しは `withRetry("stripe", ...)` を通っており、
 * **非リトライ対象の失敗も circuit breaker の連続失敗に数えられる**
 * （5連続で 30 秒 open → 請求書も Connect も巻き添え）。探りを 1 件に絞れば、
 * 直後のカードのみ作成（成功）がカウンタを 0 に戻すので連続失敗が積み上がらない。
 */
let probing = false;

function accountKey(options?: Stripe.RequestOptions): string {
  return options?.stripeAccount ?? "platform";
}

function knownSupport(key: string): boolean | undefined {
  const memo = paypaySupport.get(key);
  if (memo === undefined || memo.until <= Date.now()) return undefined;
  return memo.supported;
}

function remember(key: string, supported: boolean): void {
  paypaySupport.set(key, {
    supported,
    until: Date.now() + (supported ? SUPPORTED_TTL_MS : UNSUPPORTED_TTL_MS),
  });
}

/** PayPay で払える金額か。 */
export function inPaypayRange(amountJpy: number): boolean {
  return Number.isFinite(amountJpy) && amountJpy >= PAYPAY_MIN_JPY && amountJpy <= PAYPAY_MAX_JPY;
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
  const key = accountKey(options);
  const support = knownSupport(key);
  // 未知のアカウントは 1 件ずつ探る。探り中の同時会計はカードのみで通す
  // （PayPay が出ないだけで、会計は止まらない）
  const probe = support === undefined && !probing;

  if (inPaypayRange(amountJpy) && (support === true || probe)) {
    if (probe) probing = true;
    try {
      const session = await stripe.checkout.sessions.create(
        { ...params, payment_method_types: ["card", PAYPAY_METHOD] },
        options,
      );
      remember(key, true);
      return session;
    } catch (e) {
      if (!isPaypayRejection(e)) throw e;
      remember(key, false);
      logger.info("pos checkout: paypay unavailable, falling back to card", {
        account: key,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (probe) probing = false;
    }
  }

  return stripe.checkout.sessions.create({ ...params, payment_method_types: ["card"] }, options);
}
