/**
 * GET /api/admin/accounting/{provider}/callback
 *
 * OAuth 認可コードを受けてトークンに交換し、provider の bootstrap で
 * 「事業所 / 売上勘定 / 税区分」を自動取得して `accounting_integrations` に保存する。
 *
 * セキュリティ:
 *   - state = tenantId。Square 連携と同じパターン。
 *   - Supabase セッションでログイン済みユーザを確認し、その user が state の
 *     テナントに所属していることを `tenant_memberships` で再検証してから DB 書込。
 *   - access/refresh トークンは buildSecretWrite で envelope 暗号化。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { buildTokenWritePayload } from "@/lib/accounting/tokenStore";
import { getAccountingProviderClient, isAccountingProvider } from "@/lib/accounting/registry";
import { logger } from "@/lib/logger";
import { verifyOAuthState } from "@/lib/integrations/oauthState";

export const dynamic = "force-dynamic";

function redirect(base: string, params: Record<string, string>): NextResponse {
  const url = new URL("/admin/accounting", base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const log = logger.child({ route: `accounting/${provider}/callback` });

  if (!isAccountingProvider(provider)) {
    return redirect(baseUrl, { error: "unknown_provider" });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    return redirect(baseUrl, { provider, error: "denied" });
  }
  if (!code || !state) {
    return redirect(baseUrl, { provider, error: "missing_params" });
  }

  // 認証ユーザの取得
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect(baseUrl, { provider, error: "unauthenticated" });
  }

  const verifiedState = verifyOAuthState({ state, provider });
  if (!verifiedState.ok) {
    log.warn("callback: invalid oauth state", { provider, reason: verifiedState.reason });
    return redirect(baseUrl, { provider, error: "invalid_state" });
  }

  const tenantId = verifiedState.tenantId;

  // テナントメンバーシップ確認
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (!membership) {
    log.warn("callback: user is not a member of state tenant", { userId: user.id, tenantId });
    return redirect(baseUrl, { provider, error: "unauthorized" });
  }

  const role = membership.role as string;
  if (role !== "owner" && role !== "admin") {
    return redirect(baseUrl, { provider, error: "forbidden" });
  }

  const client = getAccountingProviderClient(provider);
  const redirectUri = `${baseUrl}/api/admin/accounting/${provider}/callback`;

  try {
    // 1) code → token
    const tokens = await client.exchangeCode({ code, redirectUri });

    // 2) bootstrap (会社/勘定科目/税区分の自動取得)
    let bootstrap;
    try {
      bootstrap = await client.bootstrap(tokens.accessToken);
    } catch (e) {
      log.warn("callback: bootstrap failed (still saving connection)", {
        error: e instanceof Error ? e.message : String(e),
      });
      bootstrap = null;
    }

    // 3) 暗号化して upsert
    const tokenPayload = await buildTokenWritePayload(tokens);

    const { error: upsertErr } = await admin.from("accounting_integrations").upsert(
      {
        tenant_id: tenantId,
        provider,
        ...tokenPayload,
        external_company_id: bootstrap?.company.id ?? null,
        external_company_name: bootstrap?.company.name ?? null,
        default_sales_account_id: bootstrap?.defaultSalesAccount?.id ?? null,
        default_sales_account_name: bootstrap?.defaultSalesAccount?.name ?? null,
        default_tax_code: bootstrap?.defaultTaxCode?.code ?? null,
        default_tax_rate: bootstrap?.defaultTaxCode?.rate ?? null,
        default_partner_id: bootstrap?.defaultPartner?.id ?? null,
        status: "active",
        auto_sync_enabled: true,
        last_error: null,
        connected_at: new Date().toISOString(),
        connected_by: user.id,
      },
      { onConflict: "tenant_id,provider" },
    );

    if (upsertErr) {
      log.error("callback: db upsert failed", upsertErr, { tenantId, provider });
      return redirect(baseUrl, { provider, error: "db_save" });
    }

    return redirect(baseUrl, { provider, status: "connected" });
  } catch (e) {
    log.error("callback: token exchange or bootstrap failed", e, { tenantId, provider });
    return redirect(baseUrl, { provider, error: "exchange_failed" });
  }
}
