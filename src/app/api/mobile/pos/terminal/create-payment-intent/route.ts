import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal PaymentIntent 作成（モバイルアプリ用） ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const limited = await checkRateLimit(req, "mobile_terminal");
    if (limited) return limited;

    const { client, accessToken } = createMobileClient(req);
    if (!client) {
      return apiUnauthorized();
    }

    const caller = await resolveMobileCaller(client, accessToken);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // amount バリデーシ���ン
    const amount = parseInt(String(body?.amount ?? 0), 10);
    if (!amount || amount < 1 || amount > 999_999_999) {
      return apiValidationError("invalid_amount");
    }

    const currency = String(body?.currency ?? "jpy");
    const description = body?.description ? String(body.description) : undefined;
    const extraMetadata =
      body?.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, string>) : {};

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

    return apiJson({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      connect_account: connectAccountId && isOnboarded ? connectAccountId : null,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/terminal/create-payment-intent");
  }
}

// ─── GET: PaymentIntent ステ���タス確認（ポーリング用） ───
export async function GET(req: NextRequest) {
  try {
    const { client, accessToken } = createMobileClient(req);
    if (!client) {
      return apiUnauthorized();
    }

    const caller = await resolveMobileCaller(client, accessToken);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id || !id.startsWith("pi_")) {
      return apiValidationError("invalid_id");
    }

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

    const pi = await stripe.paymentIntents.retrieve(id, stripeOptions);

    // tenant_id チェック（自テナントのPIのみ参照可能）
    if (pi.metadata?.tenant_id !== caller.tenantId) {
      return apiNotFound("not_found");
    }

    return apiJson({
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/terminal/create-payment-intent GET");
  }
}
