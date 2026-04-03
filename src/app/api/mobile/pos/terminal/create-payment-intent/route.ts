import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal PaymentIntent 作成（モバイルアプリ用） ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const limited = await checkRateLimit(req, "mobile_terminal");
    if (limited) return limited;

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

    // amount バリデーション
    const amount = parseInt(String(body?.amount ?? 0), 10);
    if (!amount || amount < 1 || amount > 999_999_999) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const currency = String(body?.currency ?? "jpy");
    const description = body?.description ? String(body.description) : undefined;
    const extraMetadata =
      body?.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, string>) : {};

    // テナントのStripe Connectアカウントを取得
    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
    });

    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency,
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        ...(description ? { description } : {}),
        metadata: {
          tenant_id: caller.tenantId,
          user_id: caller.userId,
          source: "mobile_pos",
          ...extraMetadata,
        },
      },
      stripeOptions,
    );

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      connect_account: connectAccountId && isOnboarded ? connectAccountId : null,
    });
  } catch (e: unknown) {
    console.error("[mobile/pos/terminal/create-payment-intent] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── GET: PaymentIntent ステータス確認（ポーリング用） ───
export async function GET(req: NextRequest) {
  try {
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

    const id = req.nextUrl.searchParams.get("id");
    if (!id || !id.startsWith("pi_")) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    // テナントのStripe Connectアカウントを取得
    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
    });

    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    const pi = await stripe.paymentIntents.retrieve(id, stripeOptions);

    // tenant_id チェック（自テナントのPIのみ参照可能）
    if (pi.metadata?.tenant_id !== caller.tenantId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
    });
  } catch (e: unknown) {
    console.error("[mobile/pos/terminal/create-payment-intent GET] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
