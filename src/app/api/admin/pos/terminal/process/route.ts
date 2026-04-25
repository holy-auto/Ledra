import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posTerminalProcessSchema } from "@/lib/validations/pos";

export const dynamic = "force-dynamic";

// ─── POST: Terminal リーダーに PaymentIntent を送信（server-driven） ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`terminal-process:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = posTerminalProcessSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { payment_intent_id: paymentIntentId, reader_id: readerId } = parsed.data;
    if (!paymentIntentId.startsWith("pi_")) return apiValidationError("invalid_payment_intent_id");
    if (!readerId.startsWith("tmr_")) return apiValidationError("invalid_reader_id");

    // テナントのStripe Connectアカウントを取得
    const { admin } = createTenantScopedAdmin(caller.tenantId);
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

    return apiJson({ reader });
  } catch (e: unknown) {
    console.error("[pos/terminal/process] error:", e);

    // Stripe エラーの場合は詳細を返す
    if (e && typeof e === "object" && "type" in e) {
      const stripeError = e as { type: string; message?: string; code?: string };
      return apiJson(
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
