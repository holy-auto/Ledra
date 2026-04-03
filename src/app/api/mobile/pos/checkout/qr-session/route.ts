import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/pos/checkout/qr-session
 *
 * Android端末向け：Stripe Checkout Session を作成し、
 * お客様のスマホで読み込めるQR URL を返す。
 *
 * 入金先: テナントの Stripe Connect アカウント（tenants.stripe_connect_account_id）
 * フィー: なし（POS決済はStripeの決済手数料のみ施工店負担）
 *
 * レスポンス:
 *   { url: string, session_id: string }
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  const amount = parseInt(String(body?.amount ?? 0), 10);
  if (!amount || amount < 1 || amount > 999_999_999) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const reservationId = String(body?.reservation_id ?? "");
  const tenantId = String(body?.tenant_id ?? "");
  const storeId = String(body?.store_id ?? "");

  if (!reservationId || !tenantId) {
    return NextResponse.json({ error: "reservation_id and tenant_id are required" }, { status: 400 });
  }

  // テナントの Stripe Connect アカウント取得
  // ※ tenants テーブルのカラムは stripe_connect_account_id / stripe_connect_onboarded
  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", tenantId)
    .single();

  const connectAccountId = tenantRow?.stripe_connect_onboarded
    ? (tenantRow.stripe_connect_account_id as string | null)
    : null;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });

  // Checkout Session 作成（お客様が自分のスマホで決済）
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ledra.co.jp";
  const successUrl = `${baseUrl}/pos/qr-complete?reservation_id=${reservationId}`;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: amount,
          product_data: {
            name: "施工料金",
            metadata: {
              reservation_id: reservationId,
              store_id: storeId,
            },
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      reservation_id: reservationId,
      tenant_id: tenantId,
      store_id: storeId,
      cashier_id: caller.userId,
      source: "ledra_mobile_qr",
    },
    success_url: successUrl,
    cancel_url: successUrl, // キャンセル時も同じページ（スタッフ側でポーリング検知）
    // セッション有効期限: 30分
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  };

  // Connect アカウントがオンボーディング済みの場合はそのアカウントで決済
  // → 入金先: 施工店の Stripe Connect アカウント（施工店の銀行口座）
  // → フィー: なし（POS決済はプラットフォームフィー不要）
  const stripeOptions = connectAccountId ? { stripeAccount: connectAccountId } : undefined;

  const session = await stripe.checkout.sessions.create(sessionParams, stripeOptions);

  return NextResponse.json({
    url: session.url,
    session_id: session.id,
    connect_account: connectAccountId ?? null,
  });
}
