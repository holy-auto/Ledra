/**
 * Authorization Code フローの共通処理。provider 固有の分岐をここに書かない
 * （書きたくなったら OAuthProviderSpec のフックに寄せる）。
 */

import type { OAuthProviderSpec, OAuthTokenResponse } from "./types";

const TOKEN_TIMEOUT_MS = 10_000;

/** callback の redirect_uri。authorize と token 交換で完全一致している必要がある。 */
export function buildRedirectUri(baseUrl: string, providerId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/admin/connect/${providerId}/callback`;
}

export function buildAuthorizeUrl(
  spec: OAuthProviderSpec,
  opts: { state: string; redirectUri: string; clientId: string },
): string {
  const url = new URL(spec.authorizeUrl);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", opts.state);
  if (spec.scopes.length > 0) url.searchParams.set("scope", spec.scopes.join(" "));
  for (const [k, v] of Object.entries(spec.extraAuthParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export class OAuthExchangeError extends Error {
  constructor(
    readonly providerId: string,
    readonly status: number,
    message: string,
  ) {
    super(`[${providerId}] token exchange failed (${status}): ${message}`);
    this.name = "OAuthExchangeError";
  }
}

/**
 * code → token 交換。RFC 6749 の form-encoded POST。
 *
 * レスポンス本文の妥当性 (Slack の `ok:false` のような provider 独自のエラー表現) は
 * spec.onConnected 側で判定する。ここは HTTP レイヤと JSON パースまで。
 */
export async function exchangeCodeForToken(
  spec: OAuthProviderSpec,
  opts: { code: string; redirectUri: string; clientId: string; clientSecret: string },
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });

  const res = await fetch(spec.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) throw new OAuthExchangeError(spec.id, res.status, text.slice(0, 200));

  try {
    return JSON.parse(text) as OAuthTokenResponse;
  } catch {
    throw new OAuthExchangeError(spec.id, res.status, "response was not JSON");
  }
}
