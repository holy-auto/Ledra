/**
 * tenant_integrations 行の読み書き。
 *
 * トークンは accounting_integrations と同じ envelope 暗号化
 * (@/lib/crypto/tenantSecrets) を流用する。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { buildSecretWrite, readSecret } from "@/lib/crypto/tenantSecrets";
import { logger } from "@/lib/logger";
import type { IntegrationStatus, OAuthProviderSpec, OAuthTokenResponse, ProviderConnectionInfo } from "./types";

/** 画面に返して安全な接続状態 (秘密情報を含まない) */
export interface IntegrationConnection {
  provider: string;
  status: IntegrationStatus;
  external_account_id: string | null;
  external_account_name: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  connected_at: string | null;
  last_error: string | null;
}

const PUBLIC_COLUMNS =
  "provider, status, external_account_id, external_account_name, scopes, metadata, connected_at, last_error";

export async function getConnection(tenantId: string, provider: string): Promise<IntegrationConnection | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data, error } = await admin
    .from("tenant_integrations")
    .select(PUBLIC_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  // 取得失敗 (マイグレーション未適用など) を黙って「未連携」に潰さない。
  if (error) logger.error("tenant_integrations select failed", error, { provider });
  return (data as IntegrationConnection | null) ?? null;
}

/**
 * 連携ページの一覧表示用。1 クエリで全 provider 分を取る。
 *
 * `failed` は「取得できなかった」を「未連携」と区別するためのフラグ。
 * このリポジトリではマイグレーション未適用のドリフトが実際に起きているので、
 * テーブルが無いときに画面が静かに嘘をつかないようにする。
 */
export async function listConnections(
  tenantId: string,
): Promise<{ byProvider: Record<string, IntegrationConnection>; failed: boolean }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data, error } = await admin.from("tenant_integrations").select(PUBLIC_COLUMNS).eq("tenant_id", tenantId);
  if (error) {
    logger.error("tenant_integrations list failed", error, { tenantId });
    return { byProvider: {}, failed: true };
  }
  const rows = (data as IntegrationConnection[] | null) ?? [];
  return { byProvider: Object.fromEntries(rows.map((r) => [r.provider, r])), failed: false };
}

/** access_token を復号して返す。未接続 / 復号失敗は null。 */
export async function readAccessToken(tenantId: string, provider: string): Promise<string | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data } = await admin
    .from("tenant_integrations")
    .select("access_token_ciphertext, status")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  const row = data as { access_token_ciphertext: string | null; status: string } | null;
  if (!row || row.status !== "active") return null;
  return readSecret(row.access_token_ciphertext, `tenant_integrations.${provider}.access_token`);
}

export async function saveConnection(params: {
  tenantId: string;
  spec: OAuthProviderSpec;
  token: OAuthTokenResponse;
  info: ProviderConnectionInfo;
  connectedBy: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { tenantId, spec, token, info, connectedBy } = params;
  const { admin } = createTenantScopedAdmin(tenantId);

  // storeTokens=false の provider には秘密情報を持たせない (Slack など)
  const tokenColumns = spec.storeTokens
    ? {
        access_token_ciphertext: (await buildSecretWrite(token.access_token)).ciphertext,
        refresh_token_ciphertext: (await buildSecretWrite(token.refresh_token)).ciphertext,
        token_expires_at:
          typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      }
    : { access_token_ciphertext: null, refresh_token_ciphertext: null, token_expires_at: null };

  // scope はスペース区切り (RFC 6749) が標準。provider が配列を返す場合も拾う。
  const grantedScopes = Array.isArray(token.scope)
    ? (token.scope as string[])
    : typeof token.scope === "string"
      ? token.scope.split(/[\s,]+/).filter(Boolean)
      : [...spec.scopes];

  const { error } = await admin.from("tenant_integrations").upsert(
    {
      tenant_id: tenantId,
      provider: spec.id,
      status: "active" satisfies IntegrationStatus,
      ...tokenColumns,
      external_account_id: info.externalAccountId ?? null,
      external_account_name: info.externalAccountName ?? null,
      scopes: grantedScopes,
      metadata: info.metadata ?? {},
      last_error: null,
      connected_at: new Date().toISOString(),
      connected_by: connectedBy,
    },
    { onConflict: "tenant_id,provider" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 連携解除。行は履歴として残し status だけ落とす (accounting / square と同じ流儀)。
 * トークンは解除時点で不要になるので必ず消す。
 */
export async function markDisconnected(tenantId: string, provider: string): Promise<{ ok: boolean; error?: string }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { error } = await admin
    .from("tenant_integrations")
    .update({
      status: "disconnected" satisfies IntegrationStatus,
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      token_expires_at: null,
    })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
  return error ? { ok: false, error: error.message } : { ok: true };
}
