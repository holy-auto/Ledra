import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBaseUrl } from "@/lib/url";
import { apiOk, apiInternalError, apiUnauthorized, apiNotFound, apiValidationError } from "@/lib/api/response";
import { resolveCallerBasic } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as any });
}

// ─── POST: Create Connect account + onboarding link ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded, name")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) return apiNotFound("テナントが見つかりません。");

    const stripe = getStripe();
    let accountId = tenant.stripe_connect_account_id as string | null;

    // Create account if not exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: "JP",
        business_profile: {
          name: (tenant.name as string) || undefined,
        },
      });
      accountId = account.id;

      await admin
        .from("tenants")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", caller.tenantId);
    }

    // Generate onboarding link
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const baseUrl = resolveBaseUrl({ req });
    const returnUrl = (body?.return_url as string) || `${baseUrl}/admin/settings`;
    const refreshUrl = (body?.refresh_url as string) || `${baseUrl}/admin/settings`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return apiOk({
      account_id: accountId,
      onboarding_url: accountLink.url,
    });
  } catch (e) {
    return apiInternalError(e, "stripe connect create");
  }
}

// ─── GET: Check Connect account status ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) return apiNotFound("テナントが見つかりません。");

    const accountId = tenant.stripe_connect_account_id as string | null;
    if (!accountId) {
      return NextResponse.json({
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
    if (onboarded !== tenant.stripe_connect_onboarded) {
      await admin
        .from("tenants")
        .update({ stripe_connect_onboarded: onboarded })
        .eq("id", caller.tenantId);
    }

    return NextResponse.json({
      connected: true,
      onboarded,
      account_id: accountId,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  } catch (e) {
    return apiInternalError(e, "stripe connect status");
  }
}

// ─── DELETE: Disconnect Connect account ───
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) return apiNotFound("テナントが見つかりません。");

    const accountId = tenant.stripe_connect_account_id as string | null;
    if (!accountId) {
      return apiValidationError("Stripe Connect アカウントが接続されていません。");
    }

    // Clear local records (Stripe account itself is not deleted — the shop retains their Stripe account)
    await admin
      .from("tenants")
      .update({
        stripe_connect_account_id: null,
        stripe_connect_onboarded: false,
      })
      .eq("id", caller.tenantId);

    return apiOk({ disconnected: true, previous_account_id: accountId });
  } catch (e) {
    return apiInternalError(e, "stripe connect disconnect");
  }
}
