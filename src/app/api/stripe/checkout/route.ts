import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planTierToPriceId } from "@/lib/stripe/plan";
import { checkoutSchema } from "@/lib/validations/stripe";
import { apiOk, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { tenant_id, plan_tier } = parsed.data;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as any });
    const supabase = createAdminClient();

    // tenants から stripe_customer_id を取得
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!tenant) return apiNotFound("テナントが見つかりません。");

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
      metadata: { tenant_id, plan_tier },
      subscription_data: { metadata: { tenant_id, plan_tier } },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/admin/billing?status=success`,
      cancel_url: `${appUrl}/admin/billing?status=cancel`,
      allow_promotion_codes: false,
    });


    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "stripe checkout");
  }
}
