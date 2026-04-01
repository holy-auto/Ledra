import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/pos/checkout/qr-status?session_id=xxx
 *
 * Stripe Checkout Session の支払い状態をポーリングする。
 * アプリ側は 3 秒ごとに叩き、status === "paid" になったら会計完了処理へ進む。
 *
 * レスポンス:
 *   { status: "pending" | "paid" | "expired" | "cancelled" }
 */
export async function GET(req: NextRequest) {
  const { client, accessToken } = createMobileClient(req);
  if (!client) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const caller = await resolveMobileCaller(client, accessToken);
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!requireMinRole(caller, "staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "stripe not configured" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  // Stripe セッションのステータスを Ledra 用にマッピング
  // payment_status: "paid" | "unpaid" | "no_payment_required"
  // status: "open" | "complete" | "expired"
  let status: "pending" | "paid" | "expired" | "cancelled";

  if (session.payment_status === "paid" && session.status === "complete") {
    status = "paid";
  } else if (session.status === "expired") {
    status = "expired";
  } else {
    status = "pending";
  }

  return NextResponse.json({
    status,
    payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    amount_total: session.amount_total,
  });
}
