import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError, apiValidationError } from "@/lib/api/response";
import { stripeConnectCreateSchema } from "@/lib/validations/stripe";

export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

/** オープンリダイレクト対策: 許可済みオリジンのURLのみ通す */
function safeUrl(candidate?: string | null, fallback?: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";
  const safe = fallback ?? `${base}/admin/settings`;
  if (!candidate) return safe;
  if (base && candidate.startsWith(base)) return candidate;
  return safe;
}

// ─── POST: Create Connect account + onboarding link ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded, name")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) return apiNotFound("tenant_not_found");

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

      await admin.from("tenants").update({ stripe_connect_account_id: accountId }).eq("id", caller.tenantId);
    }

    // Generate onboarding link
    const parsed = stripeConnectCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const returnUrl = safeUrl(parsed.data.return_url);
    const refreshUrl = safeUrl(parsed.data.refresh_url);

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return apiJson({
      ok: true,
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
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) return apiNotFound("tenant_not_found");

    const accountId = tenant.stripe_connect_account_id as string | null;
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
    if (onboarded !== tenant.stripe_connect_onboarded) {
      await admin.from("tenants").update({ stripe_connect_onboarded: onboarded }).eq("id", caller.tenantId);
    }

    return apiJson({
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
