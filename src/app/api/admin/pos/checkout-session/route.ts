import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posCheckoutSessionSchema } from "@/lib/validations/pos";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Checkout Session 作成（QRコード決済用） ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`checkout-session:${ip}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = posCheckoutSessionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { amount, description: descriptionRaw, reservation_id, customer_id } = parsed.data;
    const description = descriptionRaw ?? "POS会計";

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

    // Connectアカウントがある場合はそちらでセッション作成
    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    // success/cancel URL の構築
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: description,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/admin/pos?checkout_success=1`,
        cancel_url: `${baseUrl}/admin/pos?checkout_cancel=1`,
        metadata: {
          tenant_id: caller.tenantId,
          user_id: caller.userId,
          ...(reservation_id ? { reservation_id } : {}),
          ...(customer_id ? { customer_id } : {}),
        },
      },
      stripeOptions,
    );

    return apiJson({
      session_id: session.id,
      url: session.url,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "pos/checkout-session");
  }
}

// ─── GET: Checkout Session ステータス確認（ポーリング用） ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const id = req.nextUrl.searchParams.get("id");
    if (!id || !id.startsWith("cs_")) {
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

    const session = await stripe.checkout.sessions.retrieve(id, stripeOptions);

    // tenant_id チェック（自テナントのセッションのみ参照可能）
    if (session.metadata?.tenant_id !== caller.tenantId) {
      return apiJson({ error: "not_found" }, { status: 404 });
    }

    return apiJson({
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "pos/checkout-session GET");
  }
}
