import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Terminal リーダーに PaymentIntent を送信（server-driven） ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`terminal-process:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const paymentIntentId = String(body?.payment_intent_id ?? "");
    const readerId = String(body?.reader_id ?? "");

    if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
      return apiValidationError("invalid_payment_intent_id");
    }
    if (!readerId || !readerId.startsWith("tmr_")) {
      return apiValidationError("invalid_reader_id");
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

    // リーダーに PaymentIntent を送信
    const reader = await stripe.terminal.readers.processPaymentIntent(
      readerId,
      { payment_intent: paymentIntentId },
      stripeOptions,
    );

    return NextResponse.json({ reader });
  } catch (e: unknown) {
    console.error("[pos/terminal/process] error:", e);

    // Stripe エラーの場合は詳細を返す
    if (e && typeof e === "object" && "type" in e) {
      const stripeError = e as { type: string; message?: string; code?: string };
      return NextResponse.json(
        {
          error: stripeError.message ?? "stripe_error",
          code: stripeError.code,
          type: stripeError.type,
        },
        { status: 400 },
      );
    }

    return apiInternalError(e, "pos/terminal/process");
  }
}
