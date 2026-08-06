/**
 * 公開: Stripe Checkout 成功後のアクセス付与 (アカウント不要)
 *
 * GET /api/public/vehicle-report/unlock?session_id={CHECKOUT_SESSION_ID}
 *
 * Stripe の success_url。Checkout セッションを直接照会して支払い確定を
 * 確認し (webhook 遅延に依存しない)、注文を paid に確定したうえで、
 * /v/[vin] のペイウォールを解錠する httpOnly Cookie を発行する。
 *
 * webhook (checkout.session.completed) と二重に paid 化しても、
 * 同じ最終状態へ収束するだけなので安全 (冪等)。
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import { reportCookieName, REPORT_ACCESS_VALIDITY_DAYS } from "@/lib/vehicleReport/access";
import { recordVehicleReportRevenueShares } from "@/lib/vehicleReport/revenueShare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isSecureCookie = process.env.NODE_ENV === "production";

function getStripe() {
  return getStripeClient();
}

function appBaseUrl(): string {
  const u = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!u) throw new Error("Missing APP_URL");
  return u.replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  if (!isPassportPublicEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const base = appBaseUrl();

  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.redirect(`${base}/`, { status: 303 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const orderId = session.metadata?.vehicle_report_order_id ?? null;
    const vin = session.metadata?.vin ?? null;
    if (!orderId || !vin) {
      return NextResponse.redirect(`${base}/`, { status: 303 });
    }

    const vehicleUrl = `${base}/v/${encodeURIComponent(vin)}`;
    const admin = createServiceRoleAdmin("vehicle report unlock — confirm Stripe session, grant access cookie");

    const { data: orderRaw } = await admin
      .from("vehicle_report_orders")
      .select("id, access_token, status, expires_at")
      .eq("id", orderId)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    const order = orderRaw as
      | { id: string; access_token: string; status: string; expires_at: string | null }
      | null;

    if (!order) {
      return NextResponse.redirect(vehicleUrl, { status: 303 });
    }

    // Payment not completed → send back to the (free) teaser.
    if (session.payment_status !== "paid") {
      return NextResponse.redirect(`${vehicleUrl}?pending=1`, { status: 303 });
    }

    // Confirm paid (idempotent fallback for webhook lag).
    let expiresAtIso = order.expires_at;
    if (order.status === "pending") {
      // Only a pending order becomes paid — never re-pay one already flipped to
      // `refunded` (webhook ordering safety; guarded atomically on status).
      expiresAtIso = new Date(Date.now() + REPORT_ACCESS_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("vehicle_report_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          expires_at: expiresAtIso,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
        })
        .eq("id", order.id)
        .eq("status", "pending");
    } else if (order.status === "paid" && !expiresAtIso) {
      // Already paid but missing the access window (rare) → backfill only.
      expiresAtIso = new Date(Date.now() + REPORT_ACCESS_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("vehicle_report_orders")
        .update({ expires_at: expiresAtIso, updated_at: new Date().toISOString() })
        .eq("id", order.id);
    }

    // Book the merchant revenue-share accrual (fallback for webhook lag).
    // Idempotent vs the webhook path via UNIQUE(order_id, tenant_id).
    // Never let an accounting hiccup block the buyer's paid access — the
    // webhook path books the same shares, so a failure here self-heals.
    try {
      await recordVehicleReportRevenueShares(order.id);
    } catch (shareErr) {
      console.error("vehicle report unlock: revenue share booking failed (non-fatal)", { orderId: order.id, shareErr });
    }

    const maxAgeSec = expiresAtIso
      ? Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000))
      : REPORT_ACCESS_VALIDITY_DAYS * 24 * 60 * 60;

    const res = NextResponse.redirect(vehicleUrl, { status: 303 });
    res.cookies.set(reportCookieName(vin), order.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: maxAgeSec,
    });
    return res;
  } catch {
    // Never leak Stripe errors to the buyer; fail back to home.
    return NextResponse.redirect(`${base}/`, { status: 303 });
  }
}
