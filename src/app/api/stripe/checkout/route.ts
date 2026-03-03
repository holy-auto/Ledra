import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planTierToPriceId, type PlanTier } from "@/lib/stripe/plan";

type Body = { tenant_id: string; plan_tier: PlanTier };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const tenant_id = String(body.tenant_id ?? "").trim();
    const plan_tier = body.plan_tier as PlanTier;

    if (!tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    if (!plan_tier || !["mini", "standard", "pro"].includes(plan_tier)) {
      return NextResponse.json({ error: "plan_tier must be mini|standard|pro" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as any });
    const supabase = createAdminClient();

    // tenants から stripe_customer_id を取得
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

    let customerId = tenant.stripe_customer_id as string | null;

    // ないならStripe Customerを作る（テナント単位）
    if (!customerId) {
      const c = await stripe.customers.create({
        name: tenant.name ?? "HOLY-CERT Tenant",
        metadata: { tenant_id },
      });
      customerId = c.id;

      const { error: uErr } = await supabase
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant_id);

      if (uErr) throw uErr;
    }

    const priceId = planTierToPriceId(plan_tier);
    const appUrl = process.env.APP_URL!;
    if (!appUrl) throw new Error("Missing APP_URL");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: tenant_id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/admin/billing?status=success`,
      cancel_url: `${appUrl}/admin/billing?status=cancel`,
      subscription_data: {
        metadata: { tenant_id, plan_tier },
      },
      metadata: { tenant_id, plan_tier },
      allow_promotion_codes: false,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error("stripe checkout error", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
