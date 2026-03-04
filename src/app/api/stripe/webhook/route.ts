import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlanTier = "mini" | "standard" | "pro";

const PRICE_TO_TIER: Record<string, PlanTier> = {
  "price_1T6mOK8STGezcQhAjoFbA93K": "mini",
  "price_1T6mOK8STGezcQhAF7JX62m4": "standard",
  "price_1T6mOK8STGezcQhAjifBSYXJ": "pro",
};

function planFromPriceId(priceId?: string | null): PlanTier | null {
  if (!priceId) return null;
  return PRICE_TO_TIER[priceId] ?? null;
}

// 運用方針：active/trialing/past_due は一旦「有効扱い」
// （unpaid/canceled/incomplete 系は false）
function subscriptionIsActive(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type TenantSelector = { by: "id"; value: string } | { by: "slug"; value: string };

function asStringId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "id" in v) return String((v as any).id);
  return String(v);
}

async function resolveTenantSelector(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<TenantSelector | null> {
  const { supabase, tenant_id, tenant_slug, customerId, subscriptionId } = params;

  if (tenant_id) return { by: "id", value: tenant_id };
  if (tenant_slug) return { by: "slug", value: tenant_slug };

  // fallback: すでに DB に stripe_id が入っている場合（2回目以降の更新イベント向け）
  if (subscriptionId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .limit(1);
    if (error) throw error;
    if (data?.[0]?.id) return { by: "id", value: data[0].id };
  }

  if (customerId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (error) throw error;
    if (data?.[0]?.id) return { by: "id", value: data[0].id };
  }

  return null;
}

async function updateTenantBySelector(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  selector: TenantSelector,
  patch: Record<string, any>
) {
  const q = supabase.from("tenants").update(patch);
  const { error } =
    selector.by === "id" ? await q.eq("id", selector.value) : await q.eq("slug", selector.value);
  if (error) throw error;
}

async function extractPlanFromSubscription(stripe: Stripe, subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;
  const plan_tier = planFromPriceId(priceId);
  const is_active = subscriptionIsActive(sub.status);
  return { sub, priceId, plan_tier, is_active };
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();

  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !whsec) {
    return NextResponse.json({ error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (e: any) {
    console.error("webhook signature verify failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = asStringId(session.customer);
        const subscriptionId = asStringId(session.subscription);

        // tenant 特定：metadata（推奨）→ client_reference_id（推奨）→ 既存 stripe_id（基本無理）
        const tenant_id = session.metadata?.tenant_id ?? session.client_reference_id ?? null;
        const tenant_slug = session.metadata?.tenant_slug ?? null;

        if (!subscriptionId) {
          throw new Error("checkout.session.completed: session.subscription is missing (expected subscription mode)");
        }

        const { plan_tier, is_active } = await extractPlanFromSubscription(stripe, subscriptionId);

        const selector = await resolveTenantSelector({
          supabase,
          tenant_id,
          tenant_slug,
          customerId,
          subscriptionId,
        });

        if (!selector) {
          throw new Error(
            `Unable to resolve tenant. Add metadata tenant_id/tenant_slug (or client_reference_id) to Checkout Session. session.id=${session.id}`
          );
        }

        const patch: Record<string, any> = {
          stripe_subscription_id: subscriptionId,
          is_active,
        };
        if (customerId) patch.stripe_customer_id = customerId;
        if (plan_tier) patch.plan_tier = plan_tier;

        await updateTenantBySelector(supabase, selector, patch);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = sub.id;
        const customerId = asStringId(sub.customer);

        const tenant_id = sub.metadata?.tenant_id ?? null;
        const tenant_slug = sub.metadata?.tenant_slug ?? null;

        const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;
        const plan_tier = planFromPriceId(priceId);
        const is_active = subscriptionIsActive(sub.status);

        const selector = await resolveTenantSelector({
          supabase,
          tenant_id,
          tenant_slug,
          customerId,
          subscriptionId,
        });

        if (!selector) {
          throw new Error(
            `Unable to resolve tenant for subscription event. subscriptionId=${subscriptionId}, customerId=${customerId}`
          );
        }

        const patch: Record<string, any> = {
          stripe_subscription_id: subscriptionId,
          is_active,
        };
        if (customerId) patch.stripe_customer_id = customerId;
        if (plan_tier) patch.plan_tier = plan_tier;

        await updateTenantBySelector(supabase, selector, patch);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = sub.id;
        const customerId = asStringId(sub.customer);

        const tenant_id = sub.metadata?.tenant_id ?? null;
        const tenant_slug = sub.metadata?.tenant_slug ?? null;

        const selector = await resolveTenantSelector({
          supabase,
          tenant_id,
          tenant_slug,
          customerId,
          subscriptionId,
        });

        if (!selector) {
          console.warn("subscription.deleted: tenant not found; skipping update", { subscriptionId, customerId });
          break;
        }

        const patch: Record<string, any> = {
          stripe_subscription_id: subscriptionId,
          is_active: false,
        };
        if (customerId) patch.stripe_customer_id = customerId;

        await updateTenantBySelector(supabase, selector, patch);
        break;
      }

      default:
        break;
    }
  } catch (e: any) {
    console.error("stripe webhook handler failed", { type: event.type, id: event.id, error: e?.message ?? e });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
