import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = { tenant_id: string };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const tenant_id = String(body.tenant_id ?? "").trim();
    if (!tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as any });
    const supabase = createAdminClient();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, stripe_customer_id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!tenant?.stripe_customer_id) return NextResponse.json({ error: "stripe_customer_id missing" }, { status: 400 });

    const appUrl = process.env.APP_URL!;
    if (!appUrl) throw new Error("Missing APP_URL");

    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${appUrl}/admin/billing`,
    });

    return NextResponse.json({ url: portal.url }, { status: 200 });
  } catch (e: any) {
    console.error("stripe portal error", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
