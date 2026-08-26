/**
 * Square 経由の QR コード決済を、**サーバが自分で**確かめてから記帳する。
 *
 * `checkoutSession.ts`（Stripe 側）と同じ考え方 —— クライアントの申告は信じない。
 * 記録の冪等キーになる payment_id は必ず Square から取り直したものを使う。
 * 金額も Square の実額を返す（申告額で記録すると請求と売上が食い違う）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSquareContext, SquareNotConnectedError } from "@/lib/square/client";
import { findRecentPayment, getPayment, getTerminalCheckout, paymentBrand } from "@/lib/square/qrCheckout";

/** POS アプリで会計した分を引き当てる窓。長くすると取り違えやすくなる。 */
const RECONCILE_WINDOW_MINUTES = 30;

export type ResolvedSquareSale =
  { ok: true; squarePaymentId: string; amountTotal: number; brand: string | null } | { ok: false; error: string };

async function context(admin: SupabaseClient, tenantId: string) {
  try {
    return { ok: true as const, ctx: await getSquareContext(admin, tenantId) };
  } catch (e) {
    if (e instanceof SquareNotConnectedError) return { ok: false as const, error: e.message };
    throw e;
  }
}

/** 完了した決済であることと金額を Square 側で確かめる。 */
function verified(payment: { id: string; status: string; amount_money?: { amount?: number } }): ResolvedSquareSale {
  if (payment.status !== "COMPLETED") return { ok: false, error: `square_not_completed: ${payment.status}` };
  const amount = payment.amount_money?.amount;
  if (typeof amount !== "number") return { ok: false, error: "square_amount_missing" };
  return { ok: true, squarePaymentId: payment.id, amountTotal: amount, brand: null };
}

/** Terminal（端末）で完了したチェックアウトを確かめる。 */
export async function resolveTerminalSale(
  admin: SupabaseClient,
  tenantId: string,
  checkoutId: string,
): Promise<ResolvedSquareSale> {
  const c = await context(admin, tenantId);
  if (!c.ok) return { ok: false, error: c.error };

  const checkout = await getTerminalCheckout(c.ctx.accessToken, checkoutId);
  if (checkout.status !== "COMPLETED") return { ok: false, error: `square_checkout_not_completed: ${checkout.status}` };

  const paymentId = checkout.payment_ids?.[0];
  if (!paymentId) return { ok: false, error: "square_payment_missing" };

  const payment = await getPayment(c.ctx.accessToken, paymentId);
  const result = verified(payment);
  return result.ok ? { ...result, brand: paymentBrand(payment) } : result;
}

/**
 * Square POS アプリで会計した分を引き当てる（端末が無い店の経路）。
 *
 * 既に Ledra に記録済みの payment は候補から外す —— 外さないと、2回続けて
 * 同額の会計をしたときに1件目を引き当てて**2件目の売上が立たない**。
 */
export async function resolvePosAppSale(
  admin: SupabaseClient,
  tenantId: string,
  amountJpy: number,
  now: Date = new Date(),
): Promise<ResolvedSquareSale> {
  const c = await context(admin, tenantId);
  if (!c.ok) return { ok: false, error: c.error };
  if (!c.ctx.locationId) return { ok: false, error: "square_location_missing" };

  const { data: recorded } = await admin
    .from("payments")
    .select("square_payment_id")
    .eq("tenant_id", tenantId)
    .not("square_payment_id", "is", null)
    .gte("created_at", new Date(now.getTime() - RECONCILE_WINDOW_MINUTES * 60_000).toISOString());

  const found = await findRecentPayment({
    accessToken: c.ctx.accessToken,
    locationId: c.ctx.locationId,
    amountJpy,
    withinMinutes: RECONCILE_WINDOW_MINUTES,
    now,
    excludeIds: (recorded ?? []).map((r) => r.square_payment_id as string),
  });

  if (!found.ok) {
    // ambiguous は「同額の会計が複数あって特定できない」。**推測で記帳しない**
    return { ok: false, error: `square_payment_${found.reason}` };
  }

  const result = verified(found.payment);
  return result.ok ? { ...result, brand: paymentBrand(found.payment) } : result;
}
