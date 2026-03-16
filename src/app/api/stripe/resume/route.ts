import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { type PlanTier, planTierToPriceId } from "@/lib/stripe/plan";
import { resumeSchema } from "@/lib/validations/stripe";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

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
    const parsed = resumeSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { access_token } = parsed.data;

    // token検証 → user_id
    const u = await admin.auth.getUser(access_token);
    if (u.error || !u.data?.user) return apiUnauthorized();
    const user_id = u.data.user.id;

    // membership → tenant_id
    const m = await admin
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) return apiInternalError(m.error, "read tenant_memberships");
    if (!m.data?.tenant_id) return apiNotFound("テナントメンバーシップが見つかりません。");

    // tenants
    const t = await admin
      .from("tenants")
      .select("id, slug, plan_tier, stripe_customer_id")
      .eq("id", m.data.tenant_id)
      .maybeSingle();

    if (t.error || !t.data) return apiInternalError(t.error ?? new Error("not found"), "read tenants");

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

    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "stripe resume");
  }
}
