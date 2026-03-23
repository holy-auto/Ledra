import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 接続トークン発行（Connect対応） ───
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // テナントのStripe Connectアカウントを取得
    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    const stripeOptions = connectAccountId && isOnboarded
      ? { stripeAccount: connectAccountId }
      : undefined;

    const token = await stripe.terminal.connectionTokens.create({}, stripeOptions);

    return NextResponse.json({ secret: token.secret });
  } catch (e: unknown) {
    console.error("[pos/terminal/connection-token] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
