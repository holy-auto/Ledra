import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { insurerPlanTierToPriceId } from "@/lib/stripe/insurerPlan";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { insurerBillingCreateSchema } from "@/lib/validations/insurer";

export const runtime = "nodejs";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error("Missing NEXT_PUBLIC_BASE_URL or VERCEL_URL: cannot resolve base URL for Stripe Checkout redirect");
}

/**
 * POST /api/insurer/billing
 * Create a Stripe Checkout session for insurer subscription.
 * Body: { plan_tier: "basic" | "pro" | "enterprise" }
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    // Only admin can manage billing
    if (caller.role !== "admin") {
      return apiForbidden("管理者のみ課金操作が可能です。");
    }

    const parsed = insurerBillingCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const planTier = parsed.data.plan_tier ?? "pro";

    let priceId: string;
    try {
      priceId = insurerPlanTierToPriceId(planTier);
    } catch {
      return apiValidationError(`プラン「${planTier}」の価格設定がありません。管理者にお問い合わせください。`);
    }

    const stripe = getStripe();
    const { admin } = createInsurerScopedAdmin(caller.insurerId);

    // Get insurer record
    const { data: insurer } = await admin
      .from("insurers")
      .select("id, name, stripe_customer_id, stripe_subscription_id")
      .eq("id", caller.insurerId)
      .single();

    if (!insurer) return apiValidationError("保険会社情報が見つかりません。");

    // If already has active subscription, redirect to portal instead
    if (insurer.stripe_subscription_id) {
      const customerId = insurer.stripe_customer_id;
      if (!customerId) {
        return apiValidationError("Stripe顧客情報がありません。サポートにお問い合わせください。");
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${resolveBaseUrl()}/insurer`,
      });

      return apiJson({ portal_url: portalSession.url });
    }

    // Create or reuse Stripe customer
    let customerId = insurer.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: {
          insurer_id: caller.insurerId,
          type: "insurer",
        },
        name: insurer.name,
      });
      customerId = customer.id;

      await admin.from("insurers").update({ stripe_customer_id: customerId }).eq("id", caller.insurerId);
    }

    // Create Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${resolveBaseUrl()}/insurer?billing=success`,
      cancel_url: `${resolveBaseUrl()}/insurer?billing=cancel`,
      metadata: {
        insurer_id: caller.insurerId,
        type: "insurer",
      },
      subscription_data: {
        metadata: {
          insurer_id: caller.insurerId,
          type: "insurer",
        },
      },
    });

    return apiJson({ checkout_url: session.url });
  } catch (e) {
    return apiInternalError(e, "insurer billing");
  }
}

/**
 * GET /api/insurer/billing
 * Returns the current billing state for the insurer.
 */
export async function GET() {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const { admin } = createInsurerScopedAdmin(caller.insurerId);
    const { data: insurer } = await admin
      .from("insurers")
      .select("plan_tier, is_active, stripe_customer_id, stripe_subscription_id")
      .eq("id", caller.insurerId)
      .single();

    if (!insurer) return apiValidationError("保険会社情報が見つかりません。");

    let subscription: {
      status: string;
      current_period_end: number | null;
      cancel_at_period_end: boolean;
    } | null = null;

    if (insurer.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        const res = await stripe.subscriptions.retrieve(insurer.stripe_subscription_id);
        // Stripe v20 moved current_period_end to items; access via Record for backwards compat
        const resRecord = res as unknown as Record<string, unknown>;
        const sub = ((resRecord.data as Record<string, unknown> | undefined) ?? resRecord) as Stripe.Subscription &
          Record<string, unknown>;
        const subAny = sub as unknown as Record<string, unknown>;
        subscription = {
          status: sub.status,
          current_period_end: (subAny.current_period_end as number | undefined) ?? null,
          cancel_at_period_end: (subAny.cancel_at_period_end as boolean | undefined) ?? false,
        };
      } catch {
        // Subscription may have been deleted
      }
    }

    return apiJson({
      plan_tier: insurer.plan_tier,
      is_active: insurer.is_active,
      has_subscription: !!insurer.stripe_subscription_id,
      subscription,
    });
  } catch (e) {
    return apiInternalError(e, "insurer billing state");
  }
}
