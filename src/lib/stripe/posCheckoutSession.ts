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
 * ポーリングが永久に paid にならない（客は店を出た、売上は立たない）。
 * ここに足してよいのは即時確定する手段だけ。
 */
import type Stripe from "stripe";

import { logger } from "@/lib/logger";

/** PayPay の1回あたりの決済上限・下限（Stripe のドキュメント記載値）。 */
export const PAYPAY_MIN_JPY = 50;
export const PAYPAY_MAX_JPY = 1_000_000;

/**
 * ponytail: `paypay` は SDK v20.4.1 (apiVersion 2026-02-25.clover) の
 * PaymentMethodType union にまだ無い（public preview のため）。API 側は受ける
 * 想定だが型が追いついていないのでここだけキャストする。
 * 上限: SDK が `paypay` を型に入れたらキャストごと削除して union に足すだけでよい。
 */
const PAYPAY = "paypay" as Stripe.Checkout.SessionCreateParams.PaymentMethodType;

/**
 * ponytail: PayPay 非対応アカウントを毎回1往復無駄にしないための
 * プロセス内メモ。プロセスごと・TTL 付きなので、Stripe 側で審査が通れば
 * 遅くとも TTL 後には PayPay が出る。
 * 上限: インスタンス単位でしか効かない。恒久的にしたいなら
 * `account.updated` webhook で `capabilities.paypay_payments` を
 * tenants に同期して、この推測を捨てる。
 */
const PAYPAY_UNSUPPORTED_TTL_MS = 10 * 60_000;
const paypayUnsupportedUntil = new Map<string, number>();

function accountKey(options?: Stripe.RequestOptions): string {
  return options?.stripeAccount ?? "platform";
}

/** この金額・このアカウントで PayPay を候補に入れてよいか。 */
export function shouldOfferPaypay(amountJpy: number, key: string): boolean {
  if (!Number.isFinite(amountJpy) || amountJpy < PAYPAY_MIN_JPY || amountJpy > PAYPAY_MAX_JPY) return false;
  const until = paypayUnsupportedUntil.get(key);
  return until === undefined || until <= Date.now();
}

/**
 * PayPay 未有効化アカウントの 400 か。
 *
 * カードは Connect オンボーディング済みが前提なので、`payment_method_types` を
 * 咎める 400 は実質 PayPay 側。取りこぼすと会計そのものが失敗するので、
 * 判定は広めに取り、カードのみでの再試行に賭ける（本当の失敗なら2回目で同じ
 * エラーが上がる）。
 */
function isPaymentMethodRejection(err: unknown): boolean {
  const e = err as { type?: string; param?: string; message?: string } | null;
  if (e?.type !== "invalid_request_error") return false;
  return /paypay|payment_method_types/i.test(`${e.param ?? ""} ${e.message ?? ""}`);
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

  if (shouldOfferPaypay(amountJpy, key)) {
    try {
      return await stripe.checkout.sessions.create({ ...params, payment_method_types: ["card", PAYPAY] }, options);
    } catch (e) {
      if (!isPaymentMethodRejection(e)) throw e;
      paypayUnsupportedUntil.set(key, Date.now() + PAYPAY_UNSUPPORTED_TTL_MS);
      logger.info("pos checkout: paypay unavailable, falling back to card", {
        account: key,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return stripe.checkout.sessions.create({ ...params, payment_method_types: ["card"] }, options);
}
