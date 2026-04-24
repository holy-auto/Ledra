import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

/** Prevent open redirect: only allow URLs under our own origin */
function safeUrl(candidate?: string | null, fallback?: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";
  const safe = fallback ?? `${base}/agent/settings`;
  if (!candidate) return safe;
  if (base && candidate.startsWith(base)) return candidate;
  return safe;
}

// ─── POST: Create or retrieve Stripe Connect onboarding link ───
export async function POST(request: NextRequest) {
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
    const role = agent.role as string;

    // Only admin can set up Stripe Connect
    if (role !== "admin") {
      return apiForbidden("Stripe Connect を設定する権限がありません。");
    }

    // Fetch agent record to check for existing Stripe account
    const { data: agentProfile, error: profileErr } = await supabase
      .from("agents")
      .select("id, stripe_account_id, name, contact_email")
      .eq("id", agentId)
      .single();

    if (profileErr || !agentProfile) {
      return apiNotFound("agent_profile_not_found");
    }

    const stripe = getStripe();
    let accountId = agentProfile.stripe_account_id as string | null;

    // Create Stripe Connect account if not already linked
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: "JP",
        email: (agentProfile.contact_email as string) || undefined,
        business_profile: {
          name: (agentProfile.name as string) || undefined,
        },
      });
      accountId = account.id;

      // Save the Stripe account ID to the agents table
      const { error: saveErr } = await supabase
        .from("agents")
        .update({
          stripe_account_id: accountId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentId);

      if (saveErr) {
        console.error("[agent/stripe-connect] save account_id error:", saveErr.message);
        // Continue anyway - the Stripe account exists even if we fail to save locally
      }
    }

    // Generate onboarding link
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";
    const returnUrl = safeUrl(body?.return_url as string | undefined, `${base}/agent/settings?stripe=success`);
    const refreshUrl = safeUrl(body?.refresh_url as string | undefined, `${base}/agent/settings?stripe=refresh`);

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return apiJson({
      ok: true,
      account_id: accountId,
      url: accountLink.url,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/stripe-connect POST");
  }
}

// ─── GET: Check Stripe Connect status for this agent ───
export async function GET() {
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
      return apiJson({
        connected: false,
        onboarded: false,
        account_id: null,
      });
    }

    // Check actual status from Stripe
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);

    const onboarded = account.charges_enabled && account.payouts_enabled;

    // Update local state if changed
    if (onboarded !== agentProfile.stripe_onboarding_done) {
      await supabase
        .from("agents")
        .update({
          stripe_onboarding_done: onboarded,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentId);
    }

    return apiJson({
      connected: true,
      onboarded,
      account_id: accountId,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/stripe-connect GET");
  }
}
