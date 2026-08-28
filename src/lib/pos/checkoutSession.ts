/**
 * Stripe Checkout Session から、**サーバが自分で**決済の事実を確かめる。
 *
 * なぜ要るか: 重複防止の鍵（PaymentIntent）をクライアントに送らせてはいけない。
 * `pi_` で始まるだけの文字列なら誰でも作れるので、
 *   - 記録済みの他人の PaymentIntent を現金会計に付ける → 「記録済み」と判定され、
 *     **その売上が丸ごと消える**（操作者には成功と出る）
 *   - でたらめな値を付ける → 後で本物の決済を記録するときに一意制約に当たる
 * が通ってしまう。Terminal 側（terminalCapture）が PaymentIntent を Stripe から
 * 取り直して `succeeded` を確かめているのと同じことを、Checkout 側でもやる。
 *
 * 金額も Stripe 側の実額（`amount_total`）を返す。クライアントの申告額で
 * 記録すると、請求額と売上が食い違う。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";

/** POS の会計手段（`pos_constants.PAYMENT_METHODS` の値）。 */
export type ResolvedPaymentMethod = "card" | "qr";

export type ResolvedCheckoutSale =
  | {
      ok: true;
      paymentIntentId: string | null;
      amountTotal: number;
      /**
       * 実際に使われた決済手段。PayPay で払われた会計を「カード」で記帳すると
       * レジ締めの突合が合わなくなるので、**Stripe 側の実績**から決める。
       * 判別できなければ null（呼び出し側の申告のまま記録する）。
       */
      paymentMethod: ResolvedPaymentMethod | null;
    }
  | { ok: false; error: string };

export async function resolvePaidCheckoutSession(
  admin: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<ResolvedCheckoutSale> {
  if (!sessionId.startsWith("cs_")) return { ok: false, error: "invalid_checkout_session" };

  const { data: tenantRow } = await admin
    .from("tenants")
    .select("stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", tenantId)
    .single();
  const connectAccountId = tenantRow?.stripe_connect_onboarded
    ? (tenantRow.stripe_connect_account_id as string | null)
    : null;

  const stripe = getStripeClient();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(
      sessionId,
      // 実際の決済手段は charge にしか出ない（`payment_method_types` は
      // 「提示した候補」であって「使われた手段」ではない）
      { expand: ["payment_intent.latest_charge"] },
      connectAccountId ? { stripeAccount: connectAccountId } : undefined,
    );
  } catch {
    return { ok: false, error: "checkout_session_not_found" };
  }

  // 他テナントのセッションを自テナントの売上として記録させない
  if (session.metadata?.tenant_id && session.metadata.tenant_id !== tenantId) {
    return { ok: false, error: "checkout_session_tenant_mismatch" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, error: `checkout_not_paid: ${session.payment_status}` };
  }
  if (typeof session.amount_total !== "number") {
    return { ok: false, error: "checkout_amount_missing" };
  }

  return {
    ok: true,
    paymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    amountTotal: session.amount_total,
    paymentMethod: resolvePaymentMethod(session),
  };
}

/**
 * 実際に使われた決済手段を Ledra の会計手段に落とす。
 *
 * PayPay / Alipay / WeChat Pay は Ledra 側の「QR決済」に当たる。
 * Apple Pay / Google Pay は Stripe 上 `card` として来るので、これまで通りカード。
 */
function resolvePaymentMethod(session: Stripe.Checkout.Session): ResolvedPaymentMethod | null {
  const intent = typeof session.payment_intent === "string" ? null : session.payment_intent;
  const charge = typeof intent?.latest_charge === "string" ? null : intent?.latest_charge;
  // ponytail: `paypay` は SDK v20.4.1 の PaymentMethodDetails 型にまだ無い
  // （public preview）ので string で比較する。SDK が追いついたら union のまま
  // switch にできる。
  const type: string | undefined = charge?.payment_method_details?.type;
  if (type === "card") return "card";
  if (type === "paypay" || type === "alipay" || type === "wechat_pay") return "qr";
  return null;
}
