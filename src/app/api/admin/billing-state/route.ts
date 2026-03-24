import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { billingStateSchema } from "@/lib/validations/stripe";
import { apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const parsed = billingStateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { access_token } = parsed.data;
    const admin = getSupabaseAdmin();

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
    let subscription: any = null;
    const subscriptionId = (t.data as any).stripe_subscription_id as string | null;

    if (subscriptionId) {
      try {
        const stripe = getStripe();

        // Stripe SDKの戻りが Response<Subscription> の場合があるため data を吸収
        const res: any = await stripe.subscriptions.retrieve(subscriptionId);
        const sub: any = res?.data ?? res;

        if (sub?.deleted) {
          subscription = { error: "Subscription is deleted" };
        } else {
          subscription = {
            id: sub.id,
            status: sub.status,
            current_period_start: sub.current_period_start ?? null,
            current_period_end: sub.current_period_end ?? null,
            cancel_at_period_end: sub.cancel_at_period_end ?? null,
            cancel_at: sub.cancel_at ?? null,
            trial_end: sub.trial_end ?? null,
          };
        }
      } catch (e) {
        subscription = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    return NextResponse.json({ tenant: t.data, role: m.data.role ?? null, subscription });
  } catch (e) {
    return apiInternalError(e, "billing-state");
  }
}
