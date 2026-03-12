import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { type PlanTier, planTierToPriceId } from "@/lib/stripe/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function baseUrl(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const app = process.env.APP_URL ?? origin;
  return app.replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const admin = getSupabaseAdmin();

    const body = await req.json().catch(() => ({} as any));
    const access_token = body?.access_token as string | undefined;

    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    // token検証 → user_id
    const u = await admin.auth.getUser(access_token);
    if (u.error || !u.data?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user_id = u.data.user.id;

    // membership → tenant_id
    const m = await admin
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) return NextResponse.json({ error: "Failed to read tenant_memberships", detail: m.error.message }, { status: 500 });
    if (!m.data?.tenant_id) return NextResponse.json({ error: "No tenant membership for this user" }, { status: 404 });

    // tenants
    const t = await admin
      .from("tenants")
      .select("id, slug, plan_tier, stripe_customer_id")
      .eq("id", m.data.tenant_id)
      .maybeSingle();

    if (t.error || !t.data) return NextResponse.json({ error: "Failed to read tenants", detail: t.error?.message ?? "not found" }, { status: 500 });

    const tenant_id = (t.data as any).id as string;
    const tenant_slug = (t.data as any).slug as string | null;
    const plan_tier = ((t.data as any).plan_tier as PlanTier | null) ?? "standard";
    const priceId = planTierToPriceId(plan_tier);

    const app = baseUrl(req);
    const success_url = `${app}/admin/billing?status=success`;
    const cancel_url = `${app}/admin/billing?status=cancel`;

    const meta: Record<string, string> = { tenant_id, plan_tier };
    if (tenant_slug) meta.tenant_slug = tenant_slug;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: tenant_id,
      metadata: meta,
      subscription_data: { metadata: meta },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      allow_promotion_codes: false,
      ...(t.data.stripe_customer_id ? { customer: t.data.stripe_customer_id } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("stripe resume failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
