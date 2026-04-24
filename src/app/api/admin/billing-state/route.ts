import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { billingStateSchema } from "@/lib/validations/stripe";
import { apiJson, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch((): Record<string, unknown> => ({}));
    const parsed = billingStateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { access_token } = parsed.data;
    const admin = createServiceRoleAdmin(
      "admin billing-state — validates caller's access_token then resolves their tenant, pre-resolution",
    );

    // access_token を検証して user_id を確定
    const u = await admin.auth.getUser(access_token);
    if (u.error || !u.data?.user) {
      return apiUnauthorized();
    }
    const user_id = u.data.user.id;

    // membership → tenant_id
    const m = await admin
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) {
      return apiInternalError(m.error, "read tenant_memberships");
    }
    if (!m.data?.tenant_id) {
      return apiNotFound("テナントメンバーシップが見つかりません。");
    }

    const t = await admin
      .from("tenants")
      .select("id, slug, name, plan_tier, is_active, stripe_customer_id, stripe_subscription_id")
      .eq("id", m.data.tenant_id)
      .maybeSingle();

    if (t.error || !t.data) {
      return apiInternalError(t.error ?? new Error("not found"), "read tenants");
    }

    // Stripeの期限情報（subscription がある時だけ）
    let subscription: Record<string, unknown> | null = null;
    const subscriptionId = (t.data as Record<string, unknown>).stripe_subscription_id as string | null;

    if (subscriptionId) {
      try {
        const stripe = getStripe();

        // Stripe SDKの戻りが Response<Subscription> の場合があるため data を吸収
        const res = await stripe.subscriptions.retrieve(subscriptionId);
        const resRecord = res as unknown as Record<string, unknown>;
        const sub = ((resRecord.data as Record<string, unknown> | undefined) ?? resRecord) as Stripe.Subscription &
          Record<string, unknown>;

        const subRec = sub as unknown as Record<string, unknown>;
        if (subRec?.deleted) {
          subscription = { error: "Subscription is deleted" };
        } else {
          subscription = {
            id: sub.id,
            status: sub.status,
            current_period_start: (subRec.current_period_start as number | undefined) ?? null,
            current_period_end: (subRec.current_period_end as number | undefined) ?? null,
            cancel_at_period_end: (subRec.cancel_at_period_end as boolean | undefined) ?? null,
            cancel_at: (subRec.cancel_at as number | undefined) ?? null,
            trial_end: (subRec.trial_end as number | undefined) ?? null,
          };
        }
      } catch (e) {
        subscription = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    return apiJson({ tenant: t.data, role: m.data.role ?? null, subscription });
  } catch (e) {
    return apiInternalError(e, "billing-state");
  }
}
