import { NextRequest } from "next/server";
import Stripe from "stripe";
import { planTierToPriceId } from "@/lib/stripe/plan";
import { checkoutSchema } from "@/lib/validations/stripe";
import { apiOk, apiInternalError, apiValidationError, apiNotFound, apiUnauthorized } from "@/lib/api/response";
import { resolveCampaign } from "@/lib/billing/campaign";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { access_token, plan_tier, annual } = parsed.data;

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    // access_token を検証して user_id を確定
    const u = await supabase.auth.getUser(access_token);
    if (u.error || !u.data?.user) {
      return apiUnauthorized();
    }
    const user_id = u.data.user.id;

    // membership → tenant_id
    const m = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) return apiInternalError(m.error, "read tenant_memberships");
    if (!m.data?.tenant_id) return apiNotFound("テナントメンバーシップが見つかりません。");

    const tenant_id = m.data.tenant_id;

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
        name: tenant.name ?? "Ledra Tenant",
        metadata: { tenant_id },
      });
      customerId = c.id;

      const { error: uErr } = await supabase
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant_id);

      if (uErr) throw uErr;
    }

    const priceId = planTierToPriceId(plan_tier, annual);
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("Missing APP_URL");

    // キャンペーン判定
    const campaign = await resolveCampaign(supabase, tenant_id, plan_tier);

    // setup fee（初期費用）: キャンペーン対象外の場合のみ追加
    const setupFeeAmounts: Record<string, number> = {
      standard: 29800,
      pro: 49800,
    };
    const setupFeeAmount = setupFeeAmounts[plan_tier];

    const addInvoiceItems: Array<{
      price_data: { currency: string; product_data: { name: string }; unit_amount: number };
      quantity: number;
    }> = [];
    if (setupFeeAmount && !campaign?.waiveSetupFee) {
      addInvoiceItems.push({
        price_data: {
          currency: "jpy",
          product_data: { name: `${plan_tier === "standard" ? "スタンダード" : "プロ"}プラン 初期費用` },
          unit_amount: setupFeeAmount,
        },
        quantity: 1,
      });
    }

    // coupon（キャンペーン割引）
    const discounts: Array<{ coupon: string }> = [];
    if (campaign?.stripeCouponId) {
      discounts.push({ coupon: campaign.stripeCouponId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: tenant_id,
      metadata: {
        tenant_id,
        plan_tier,
        ...(campaign ? { campaign_slug: campaign.slug } : {}),
      },
      subscription_data: {
        metadata: { tenant_id, plan_tier },
        ...(addInvoiceItems.length > 0
          ? { add_invoice_items: addInvoiceItems as Stripe.Checkout.SessionCreateParams.SubscriptionData.AddInvoiceItem[] }
          : {}),
      },
      line_items: [{ price: priceId, quantity: 1 }],
      ...(discounts.length > 0 ? { discounts } : {}),
      success_url: `${appUrl}/admin/billing?status=success`,
      cancel_url: `${appUrl}/admin/billing?status=cancel`,
    } as Stripe.Checkout.SessionCreateParams);

    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "stripe checkout");
  }
}
