import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError, apiValidationError } from "@/lib/api/response";
import { stripeConnectCreateSchema } from "@/lib/validations/stripe";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

/**
 * オープンリダイレクト対策: 許可済みオリジンのURLのみ通す。
 *
 * 許可するオリジン:
 *   1. リクエスト自身の origin (req.nextUrl.origin) — 実際に呼び出されたドメイン
 *   2. NEXT_PUBLIC_BASE_URL (設定されている場合) — 明示的な許可リスト
 *
 * いずれの env も無くても落ちないように、必ずリクエストの origin を基準にする。
 */
function safeUrl(req: NextRequest, candidate?: string | null, fallback?: string): string {
  const reqOrigin = req.nextUrl.origin.replace(/\/+$/, "");
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";
  const allowedBases = envBase && envBase !== reqOrigin ? [reqOrigin, envBase] : [reqOrigin];

  const safe = fallback ?? `${reqOrigin}/admin/settings`;
  if (!candidate) return safe;
  if (allowedBases.some((b) => candidate.startsWith(b))) return candidate;
  return safe;
}

// ─── POST: Create Connect account + onboarding link ───
export async function POST(req: NextRequest) {
  // Creates Stripe accounts + onboarding links. Bound abuse if a session
  // cookie leaks; auth preset (10/min/IP) is comfortable for normal flow.
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

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

    // 保存済み account_id があっても、Stripe 側で削除済み・mode 不一致
    // (test ⇄ live) などで参照できないことがある。その場合は accountLinks.create
    // が "No such account" で落ちて 500 になるので、先に存在確認して
    // ダメなら作り直すことで「接続を再開」フローを自己治癒させる。
    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId);
      } catch (retrieveErr) {
        const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
        console.warn(`[stripe connect] stale account_id ${accountId}, recreating: ${msg}`);
        await admin
          .from("tenants")
          .update({ stripe_connect_account_id: null, stripe_connect_onboarded: false })
          .eq("id", caller.tenantId);
        accountId = null;
      }
    }

    // Create account if not exists (or was just cleared above)
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
    const returnUrl = safeUrl(req, parsed.data.return_url);
    const refreshUrl = safeUrl(req, parsed.data.refresh_url);

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

// ─── DELETE: Disconnect Stripe Connect (clears tenant-side account ID) ───
export async function DELETE() {
  // Stripe アカウント自体は削除せず、テナント側の紐付けのみ解除する。
  // 解除後に「Stripe アカウントを接続」を押すと新しい account_id が発番される。
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("tenants")
      .update({ stripe_connect_account_id: null, stripe_connect_onboarded: false })
      .eq("id", caller.tenantId);

    if (error) return apiInternalError(error, "stripe connect disconnect");
    return apiJson({ ok: true, connected: false, onboarded: false, account_id: null });
  } catch (e) {
    return apiInternalError(e, "stripe connect disconnect");
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

    // Check actual status from Stripe. account_id が Stripe 側で存在しない
    // (削除済み・mode 不一致 等) ケースは "stale" として扱い、500 ではなく
    // 「未接続」相当を返してフロントで再接続フローを促す。
    const stripe = getStripe();
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch (retrieveErr) {
      const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
      console.warn(`[stripe connect] retrieve failed for ${accountId}: ${msg}`);
      await admin
        .from("tenants")
        .update({ stripe_connect_account_id: null, stripe_connect_onboarded: false })
        .eq("id", caller.tenantId);
      return apiJson({
        connected: false,
        onboarded: false,
        account_id: null,
        stale: true,
      });
    }

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
