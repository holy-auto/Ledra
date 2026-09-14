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

import { getStripeClient } from "@/lib/stripe/client";

export type ResolvedCheckoutSale =
  { ok: true; paymentIntentId: string | null; amountTotal: number } | { ok: false; error: string };

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
  };
}
