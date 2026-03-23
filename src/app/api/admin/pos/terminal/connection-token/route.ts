import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 接続トークン発行 ───
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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    const token = await stripe.terminal.connectionTokens.create();

    return NextResponse.json({ secret: token.secret });
  } catch (e: unknown) {
    console.error("[pos/terminal/connection-token] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
