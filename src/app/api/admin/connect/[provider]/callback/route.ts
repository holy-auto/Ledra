/**
 * 全連携共通の OAuth コールバック。
 *
 * provider を増やしてもこのファイルは変わらない。provider 固有の処理は
 * OAuthProviderSpec.onConnected に閉じている。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getOAuthProvider } from "@/lib/integrations/registry";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { buildRedirectUri, exchangeCodeForToken } from "@/lib/integrations/oauth";
import { saveConnection } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

const FALLBACK_RETURN_PATH = "/admin/settings/connections";

function back(baseUrl: string, path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, "");

  const spec = getOAuthProvider(provider);
  if (!spec) return back(baseUrl, FALLBACK_RETURN_PATH, { e: "unknown_provider" });

  const returnPath = spec.returnPath;
  const sp = req.nextUrl.searchParams;

  // 加盟店が連携画面で「許可しない」を押した場合
  if (sp.get("error")) return back(baseUrl, returnPath, { e: "denied", provider: spec.id });

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return back(baseUrl, returnPath, { e: "missing_params", provider: spec.id });

  const verified = verifyOAuthState({ state, provider: spec.id });
  if (!verified.ok) {
    logger.warn("integration callback: invalid state", { provider: spec.id, reason: verified.reason });
    return back(baseUrl, returnPath, { e: "invalid_state", provider: spec.id });
  }
  const tenantId = verified.tenantId;

  // state は署名済みだが、ブラウザの利用者が本当にそのテナントのメンバーかは別問題
  // (署名済み URL を第三者に踏ませる経路を塞ぐ)。Square のコールバックと同じ流儀。
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return back(baseUrl, returnPath, { e: "unauthenticated", provider: spec.id });

  const { admin } = createTenantScopedAdmin(tenantId);
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (!membership) return back(baseUrl, returnPath, { e: "unauthorized", provider: spec.id });

  const clientId = process.env[spec.clientIdEnv];
  const clientSecret = process.env[spec.clientSecretEnv];
  if (!clientId || !clientSecret) return back(baseUrl, returnPath, { e: "not_configured", provider: spec.id });

  try {
    const token = await exchangeCodeForToken(spec, {
      code,
      clientId,
      clientSecret,
      redirectUri: buildRedirectUri(baseUrl, spec.id),
    });

    // provider 固有の検証・保存。ここで throw したら active を書かない。
    const info = spec.onConnected ? await spec.onConnected({ tenantId, token }) : {};

    const saved = await saveConnection({ tenantId, spec, token, info, connectedBy: user.id });
    if (!saved.ok) {
      logger.error("integration callback: db save failed", new Error(saved.error), { provider: spec.id });
      return back(baseUrl, returnPath, { e: "db_save", provider: spec.id });
    }

    return back(baseUrl, returnPath, { connected: spec.id });
  } catch (e) {
    logger.error("integration callback failed", e, { provider: spec.id });
    return back(baseUrl, returnPath, { e: "exchange_failed", provider: spec.id });
  }
}
