import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

// ─── POST: Generate Stripe Connect Express Dashboard login link ───
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 403 });
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;

    // Fetch stripe_account_id
    const { data: agentProfile, error: profileErr } = await supabase
      .from("agents")
      .select("stripe_account_id, stripe_onboarding_done")
      .eq("id", agentId)
      .single();

    if (profileErr || !agentProfile) {
      return NextResponse.json({ error: "agent_profile_not_found" }, { status: 404 });
    }

    const accountId = agentProfile.stripe_account_id as string | null;
    if (!accountId) {
      return NextResponse.json(
        { error: "stripe_not_connected", message: "Stripe Connect アカウントが設定されていません。" },
        { status: 400 },
      );
    }

    const stripe = getStripe();

    // Try to generate a login link (works for Express accounts)
    // For Standard accounts, redirect directly to https://dashboard.stripe.com
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return NextResponse.json({ ok: true, url: loginLink.url });
    } catch (loginErr: unknown) {
      // Standard accounts don't support login links — return direct Stripe dashboard URL
      const errMsg = loginErr instanceof Error ? loginErr.message : String(loginErr);
      if (errMsg.includes("not an Express account") || errMsg.includes("login_link")) {
        // Standard account: open Stripe dashboard directly
        return NextResponse.json({
          ok: true,
          url: "https://dashboard.stripe.com/",
          note: "standard_account",
        });
      }
      throw loginErr;
    }
  } catch (e: unknown) {
    console.error("[agent/stripe/dashboard] POST error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}
