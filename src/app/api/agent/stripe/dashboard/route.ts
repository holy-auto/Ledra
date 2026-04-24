import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

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
      return apiUnauthorized();
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
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
      return apiNotFound("agent_profile_not_found");
    }

    const accountId = agentProfile.stripe_account_id as string | null;
    if (!accountId) {
      return apiValidationError("Stripe Connect アカウントが設定されていません。");
    }

    const stripe = getStripe();

    // Try to generate a login link (works for Express accounts)
    // For Standard accounts, redirect directly to https://dashboard.stripe.com
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return apiJson({ ok: true, url: loginLink.url });
    } catch (loginErr: unknown) {
      // Standard accounts don't support login links — return direct Stripe dashboard URL
      const errMsg = loginErr instanceof Error ? loginErr.message : String(loginErr);
      if (errMsg.includes("not an Express account") || errMsg.includes("login_link")) {
        // Standard account: open Stripe dashboard directly
        return apiJson({
          ok: true,
          url: "https://dashboard.stripe.com/",
          note: "standard_account",
        });
      }
      throw loginErr;
    }
  } catch (e: unknown) {
    return apiInternalError(e, "agent/stripe/dashboard POST");
  }
}
