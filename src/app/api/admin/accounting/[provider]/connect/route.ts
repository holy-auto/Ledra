/**
 * POST /api/admin/accounting/{provider}/connect
 * OAuth 認可 URL を返す (加盟店をリダイレクトさせる先)。
 *
 * GET   /api/admin/accounting/{provider}/connect — 接続詳細取得 (UI 用)
 * DELETE                                          — 連携解除 (status='disconnected')
 */

import { NextRequest } from "next/server";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiError, apiNotFound } from "@/lib/api/response";
import { getAccountingProviderClient, isAccountingProvider } from "@/lib/accounting/registry";

export const dynamic = "force-dynamic";

function buildRedirectUri(provider: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  return `${base}/api/admin/accounting/${provider}/callback`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) return apiNotFound("Unknown accounting provider");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data } = await admin
      .from("accounting_integrations")
      .select(
        "provider, status, external_company_id, external_company_name, default_sales_account_id, default_sales_account_name, default_tax_code, default_tax_rate, auto_sync_enabled, connected_at, last_synced_at, last_error",
      )
      .eq("tenant_id", tenantId)
      .eq("provider", provider)
      .maybeSingle();

    return apiOk({ integration: data ?? null });
  } catch (e) {
    return apiInternalError(e, "accounting connect GET");
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) return apiNotFound("Unknown accounting provider");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const client = getAccountingProviderClient(provider);
    let authUrl: string;
    try {
      authUrl = client.buildAuthUrl({
        state: createOAuthState({ tenantId: caller.tenantId, provider }),
        redirectUri: buildRedirectUri(provider),
      });
    } catch (e) {
      return apiError({
        code: "internal_error",
        message:
          provider === "freee"
            ? "freee連携の環境変数 (FREEE_CLIENT_ID 等) が未設定です。"
            : "マネーフォワード連携の環境変数 (MF_CLIENT_ID 等) が未設定です。",
        status: 503,
        data: { detail: e instanceof Error ? e.message : String(e) },
      });
    }

    return apiOk({ auth_url: authUrl });
  } catch (e) {
    return apiInternalError(e, "accounting connect POST");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) return apiNotFound("Unknown accounting provider");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("accounting_integrations")
      .update({
        status: "disconnected",
        access_token_ciphertext: null,
        refresh_token_ciphertext: null,
        auto_sync_enabled: false,
      })
      .eq("tenant_id", tenantId)
      .eq("provider", provider);

    if (error) return apiInternalError(error, "accounting disconnect");
    return apiOk({ disconnected: true });
  } catch (e) {
    return apiInternalError(e, "accounting connect DELETE");
  }
}
