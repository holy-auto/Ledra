/**
 * 全連携共通の接続ルート。provider ごとにルートを増やさないための 1 本。
 *
 *   GET    /api/admin/connect/{provider}  — 接続状態を取得
 *   POST   /api/admin/connect/{provider}  — 認可 URL を返す（画面がそこへ飛ばす）
 *   DELETE /api/admin/connect/{provider}  — 連携解除
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiError, apiInternalError } from "@/lib/api/response";
import { getOAuthProvider } from "@/lib/integrations/registry";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { buildAuthorizeUrl, buildRedirectUri } from "@/lib/integrations/oauth";
import { getConnection, markDisconnected } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const spec = getOAuthProvider(provider);
    if (!spec) return apiNotFound("Unknown integration provider");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 接続先アカウント名・投稿先チャンネル・運営側の env 設定状況を返すので、
    // 書き込み系と同じ admin 以上に揃える (/api/admin/line の GET と同じ方針)。
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const connection = await getConnection(caller.tenantId, spec.id);
    return apiOk({
      provider: spec.id,
      label: spec.label,
      configured: Boolean(process.env[spec.clientIdEnv] && process.env[spec.clientSecretEnv]),
      connection,
    });
  } catch (e) {
    return apiInternalError(e, "integration connect GET");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const spec = getOAuthProvider(provider);
    if (!spec) return apiNotFound("Unknown integration provider");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const clientId = process.env[spec.clientIdEnv];
    if (!clientId || !process.env[spec.clientSecretEnv]) {
      return apiError({
        code: "internal_error",
        message: `${spec.label}連携の環境変数（${spec.clientIdEnv} / ${spec.clientSecretEnv}）が未設定です。`,
        status: 503,
      });
    }

    // Square と同じく、env 未設定環境でも動くよう実リクエストの origin を fallback に使う。
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    let state: string;
    try {
      state = createOAuthState({ tenantId: caller.tenantId, provider: spec.id });
    } catch (e) {
      return apiError({
        code: "internal_error",
        message: "連携の署名鍵（INTEGRATION_OAUTH_STATE_SECRET）が未設定です。",
        status: 503,
        data: { detail: e instanceof Error ? e.message : String(e) },
      });
    }

    return apiOk({
      auth_url: buildAuthorizeUrl(spec, {
        state,
        clientId,
        redirectUri: buildRedirectUri(baseUrl, spec.id),
      }),
    });
  } catch (e) {
    return apiInternalError(e, "integration connect POST");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const spec = getOAuthProvider(provider);
    if (!spec) return apiNotFound("Unknown integration provider");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    // provider 固有の保存先 (Slack なら tenants の webhook 列) を先に消す。
    // ここが失敗したまま status だけ落とすと、画面は「未連携」なのに通知は
    // 飛び続ける状態になるため、失敗時は解除自体を失敗させる。
    if (spec.onDisconnect) await spec.onDisconnect({ tenantId: caller.tenantId });

    const result = await markDisconnected(caller.tenantId, spec.id);
    if (!result.ok) return apiInternalError(new Error(result.error), "integration disconnect");

    return apiOk({ connected: false });
  } catch (e) {
    return apiInternalError(e, "integration connect DELETE");
  }
}
