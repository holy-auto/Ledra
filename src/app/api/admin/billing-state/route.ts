import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

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
    const access_token = body?.access_token as string | undefined;

    if (!access_token) {
      return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
    }

    const admin = createAdminClient();

    // access_token を検証して user_id を確定
    const u = await admin.auth.getUser(access_token);
    if (u.error || !u.data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Failed to read tenant_memberships", detail: m.error.message }, { status: 500 });
    }
    if (!m.data?.tenant_id) {
      return NextResponse.json({ error: "No tenant membership for this user" }, { status: 404 });
    }

    const t = await admin
      .from("tenants")
      .select("id, slug, name, plan_tier, is_active, stripe_customer_id, stripe_subscription_id")
      .eq("id", m.data.tenant_id)
      .maybeSingle();

    if (t.error || !t.data) {
      return NextResponse.json({ error: "Failed to read tenants", detail: t.error?.message ?? "not found" }, { status: 500 });
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
      } catch (e: any) {
        subscription = { error: e?.message ?? String(e) };
      }
    }

    return NextResponse.json({ tenant: t.data, role: m.data.role ?? null, subscription });
  } catch (e: any) {
    console.error("billing-state failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
