import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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

function safeReturnUrl(req: NextRequest, candidate?: string | null) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? origin;
  const fallback = `${appUrl.replace(/\/+$/,"")}/admin/billing`;

  if (!candidate) return fallback;
  // open redirect 対策：APP_URL または Origin で始まるURLのみ許可
  if (appUrl && candidate.startsWith(appUrl)) return candidate;
  if (origin && candidate.startsWith(origin)) return candidate;
  return fallback;
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const admin = getSupabaseAdmin();

    const body = await req.json().catch(() => ({} as any));
    const access_token = body?.access_token as string | undefined;
    const return_url_raw = (body?.return_url as string | undefined) ?? null;

    if (!access_token) {
      return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
    }

    const u = await admin.auth.getUser(access_token);
    if (u.error || !u.data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = u.data.user.id;

    const m = await admin
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) return NextResponse.json({ error: "Failed to read tenant_memberships", detail: m.error.message }, { status: 500 });
    if (!m.data?.tenant_id) return NextResponse.json({ error: "No tenant membership for this user" }, { status: 404 });

    const t = await admin
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", m.data.tenant_id)
      .maybeSingle();

    if (t.error) return NextResponse.json({ error: "Failed to read tenants", detail: t.error.message }, { status: 500 });

    const customer = t.data?.stripe_customer_id;
    if (!customer) {
      return NextResponse.json({ error: "stripe_customer_id is missing on tenants" }, { status: 400 });
    }

    const return_url = safeReturnUrl(req, return_url_raw);

    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("stripe portal failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// GET は明示的に拒否（Billing側はPOSTで叩く想定）
export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
