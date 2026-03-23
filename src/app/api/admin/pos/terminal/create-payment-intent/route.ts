import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal PaymentIntent 作成 ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = checkRateLimit(`terminal-pi:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retry_after: rl.retryAfterSec },
        { status: 429 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
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
      body?.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, string>)
        : {};

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      ...(description ? { description } : {}),
      metadata: {
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        ...extraMetadata,
      },
    });

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (e: unknown) {
    console.error("[pos/terminal/create-payment-intent] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
