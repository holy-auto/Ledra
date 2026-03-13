import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRACE_DAYS = 14;

function graceDays(): number {
  const raw = process.env.BILLING_GRACE_DAYS ?? String(DEFAULT_GRACE_DAYS);
  const n = Math.max(0, Math.min(365, parseInt(raw, 10) || DEFAULT_GRACE_DAYS));
  return n;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

async function graceUntilIso(stripe_subscription_id: string | null) {
  if (!stripe_subscription_id) return null;
  try {
    const stripe = getStripe();
    const res: any = await stripe.subscriptions.retrieve(stripe_subscription_id);
    const sub: any = res?.data ?? res;
    const end = sub?.current_period_end ? Number(sub.current_period_end) : null;
    if (!end) return null;
    return new Date((end + graceDays() * 86400) * 1000).toISOString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const pid = req.nextUrl.searchParams.get("pid") ?? req.nextUrl.searchParams.get("public_id");
    if (!pid) return NextResponse.json({ error: "Missing pid" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const c = await supabase
      .from("certificates")
      .select("tenant_id, status")
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (c.error) return NextResponse.json({ error: "Failed to read certificate", detail: c.error.message }, { status: 500 });
    if (!c.data?.tenant_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const t = await supabase
      .from("tenants")
      .select("name, slug, is_active, stripe_subscription_id")
      .eq("id", c.data.tenant_id)
      .limit(1)
      .maybeSingle();

    if (t.error) return NextResponse.json({ error: "Failed to read tenant", detail: t.error.message }, { status: 500 });

    const billing_active = !!t.data?.is_active;

    let grace_until: string | null = null;
    let pdf_allowed = billing_active;

    if (!billing_active) {
      grace_until = await graceUntilIso((t.data as any)?.stripe_subscription_id ?? null);
      if (grace_until) {
        pdf_allowed = Date.now() < Date.parse(grace_until);
      } else {
        pdf_allowed = false;
      }
    }

    return NextResponse.json(
      {
        billing_active,
        tenant_name: t.data?.name ?? t.data?.slug ?? null,
        certificate_status: c.data.status ?? null,
        grace_until,
        pdf_allowed,
        grace_days: graceDays(),
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
