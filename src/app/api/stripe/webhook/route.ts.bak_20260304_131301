import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceIdToPlanTier } from "@/lib/stripe/plan";

export const runtime = "nodejs"; // Stripe SDKのため

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as any });
  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) return NextResponse.json({ error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (e: any) {
    console.error("webhook signature verify failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const tenant_id = (s.client_reference_id || (s.metadata?.tenant_id ?? "")).toString();
        const subId = (s.subscription ?? "").toString();
        if (!tenant_id || !subId) break;

        const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
        const priceId = sub.items.data?.[0]?.price?.id ?? "";
        const plan = priceIdToPlanTier(priceId) ?? (sub.metadata?.plan_tier as any) ?? null;

        if (!plan) {
          console.warn("Unknown plan for price:", priceId);
          break;
        }

        const { error } = await supabase
          .from("tenants")
          .update({
            stripe_subscription_id: sub.id,
            plan_tier: plan,
            is_active: sub.status === "active" || sub.status === "trialing",
          })
          .eq("id", tenant_id);

        if (error) throw error;
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tenant_id = (sub.metadata?.tenant_id ?? "").toString();
        if (!tenant_id) break;

        const priceId = sub.items.data?.[0]?.price?.id ?? "";
        const plan = priceIdToPlanTier(priceId) ?? (sub.metadata?.plan_tier as any) ?? null;

        const isActive = sub.status === "active" || sub.status === "trialing";
        const statusDeleted = event.type === "customer.subscription.deleted";

        const { error } = await supabase
          .from("tenants")
          .update({
            stripe_subscription_id: statusDeleted ? null : sub.id,
            plan_tier: plan ?? undefined,
            is_active: statusDeleted ? false : isActive,
          })
          .eq("id", tenant_id);

        if (error) throw error;
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        // 最低限：必要なら後で通知ロジックを追加
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e: any) {
    console.error("webhook handler error", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
