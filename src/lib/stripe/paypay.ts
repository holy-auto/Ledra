/**
 * PayPay（Stripe 経由）まわりの共有定義。
 *
 * PayPay は Stripe 側で**店舗ごとの申請・審査**が要る（申請しても数週間かかる）。
 * Ledra からできるのは「一緒に申請しておく」ところまでで、通るかどうかと
 * 所要時間は Stripe 次第。どの経路でも
 * **「PayPay が使えなくても既存の機能は落ちない」**ことを最優先にする。
 */
import type Stripe from "stripe";

import { logger } from "@/lib/logger";

/** PayPay の1回あたりの決済上限・下限（Stripe のドキュメント記載値）。 */
export const PAYPAY_MIN_JPY = 50;
export const PAYPAY_MAX_JPY = 1_000_000;

/**
 * ponytail: `paypay` は SDK v20.4.1 (apiVersion 2026-02-25.clover) の型にまだ
 * 無い（public preview のため）。API 側は受ける想定だが型が追いついていないので
 * ここだけキャストする。
 * 上限: SDK が `paypay` を型に入れたらキャストごと削除できる。
 */
export const PAYPAY_METHOD = "paypay" as Stripe.Checkout.SessionCreateParams.PaymentMethodType;

/** Connect アカウントに要求する capability 名。【要確認】実 API で未検証。 */
export const PAYPAY_CAPABILITY = "paypay_payments";

/**
 * 呼び出しごとに「PayPay が原因の 400」と見なす語。
 *
 * **経路をまたいで広げないこと。** 決済作成の経路で `capabilities` まで拾うと、
 * 権限を制限されたアカウントのエラーを「PayPay 非対応」と誤読して、その店から
 * 10分間 PayPay を消してしまう（しかも作成を2回投げる）。
 */
const REJECTION_PATTERNS = {
  /** Checkout Session 作成（`payment_method_types` に paypay を入れた）。 */
  payment_method: /paypay|payment_method_types/i,
  /** Connect アカウント作成（`capabilities` に paypay を入れた）。 */
  capability: /paypay|capabilities/i,
} as const;

/**
 * PayPay を扱えないアカウント／API に対する 400 か。
 *
 * stripe-node は `.type` に**クラス名**（`StripeInvalidRequestError`）を、
 * `.rawType` に API の型（`invalid_request_error`）を入れる。片方だけ見ると
 * 判定が常に false になり、**フォールバックが丸ごと死ぬ**ので両方見る。
 *
 * 判定は広めに取り、PayPay 抜きでの再試行に賭ける（本当の失敗なら2回目で
 * 同じエラーが上がる）。取りこぼすと会計やアカウント接続そのものが失敗する。
 */
export function isPaypayRejection(err: unknown, scope: keyof typeof REJECTION_PATTERNS): boolean {
  const e = err as { type?: string; rawType?: string; param?: string; message?: string } | null;
  if (e?.rawType !== "invalid_request_error" && e?.type !== "StripeInvalidRequestError") return false;
  return REJECTION_PATTERNS[scope].test(`${e.param ?? ""} ${e.message ?? ""}`);
}

/**
 * ponytail: capability を要求できない環境だと分かったら、以後は要求しない。
 *
 * なぜ要るか: 要求が通らない環境では**アカウントを作るたびに 400 を1回出す**
 * ことになる。`getStripeClient()` は全呼び出しが `withRetry("stripe", ...)` を
 * 通っており、非リトライ対象の失敗も circuit breaker の連続失敗に数えられる
 * （5連続で30秒 open → 直後のフォールバックすら弾かれて接続が 500 になる）。
 * 上限: プロセス単位・TTL 付きの推測。Stripe が対応したら遅くとも TTL 後に
 * また要求する。
 */
const CAPABILITY_UNSUPPORTED_TTL_MS = 60 * 60_000;
let capabilityUnsupportedUntil = 0;

/**
 * Connect アカウントを作る。**PayPay の利用申請も同時に出す。**
 *
 * なぜここでやるか: PayPay を後から有効化するには加盟店が自分の Stripe
 * ダッシュボードで別途申請する必要がある。作成時に capability を要求しておけば、
 * Stripe のオンボーディングが PayPay に必要な情報も**同じ入力フローで**集める
 * ので、加盟店の手続きが1回で済む。
 *
 * 要求が通らない場合（capability 名が違う・国や API バージョンが未対応）は
 * **PayPay 抜きで作り直す**。ここで落とすと加盟店が決済そのものを繋げられない。
 */
export async function createAccountRequestingPaypay(
  stripe: Stripe,
  params: Stripe.AccountCreateParams,
): Promise<Stripe.Account> {
  if (capabilityUnsupportedUntil > Date.now()) return stripe.accounts.create(params);

  try {
    return await stripe.accounts.create({
      ...params,
      capabilities: {
        ...params.capabilities,
        [PAYPAY_CAPABILITY]: { requested: true },
      } as Stripe.AccountCreateParams.Capabilities,
    });
  } catch (e) {
    if (!isPaypayRejection(e, "capability")) throw e;
    capabilityUnsupportedUntil = Date.now() + CAPABILITY_UNSUPPORTED_TTL_MS;
    // 無音で落とすと「PayPay がいつまでも出ない」だけの状態になり原因が追えない
    logger.warn("stripe connect: paypay capability not requestable, creating account without it", {
      capability: PAYPAY_CAPABILITY,
      error: e instanceof Error ? e.message : String(e),
    });
    return stripe.accounts.create(params);
  }
}
