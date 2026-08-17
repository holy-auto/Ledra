/**
 * OAuth `state` パラメータの署名・検証（全連携共通）。
 *
 * CSRF 対策として、認可開始時に「どのテナントの、どの provider の認可か」を
 * HMAC 署名付きで state に載せ、コールバックで検証する。DB を使わないので
 * サーバーレスでも状態を持たずに済む。
 *
 * もとは会計連携 (freee / マネーフォワード) 専用に置いていたが、Slack など
 * 他の連携も同じ仕組みで足りる（payload は provider を文字列で持つだけ）ため、
 * 連携共通の場所へ移した。挙動は移設前と同一。
 *
 * 署名鍵: `INTEGRATION_OAUTH_STATE_SECRET`
 *   → 後方互換のため `ACCOUNTING_OAUTH_STATE_SECRET` → `FREEE_CLIENT_SECRET`
 *     の順にフォールバックする（既存環境の env を壊さないため）。
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 10 * 60;
/** state 署名鍵の最低長。短い鍵は総当たりで署名を偽造され、tenantId を差し替えられる。 */
const MIN_SECRET_LENGTH = 32;

type OAuthStatePayload = {
  tenantId: string;
  provider: string;
  nonce: string;
  exp: number;
};

/**
 * 署名鍵を返す。長さチェックは新しい `INTEGRATION_OAUTH_STATE_SECRET` にのみ課す。
 * 後方互換の 2 つのフォールバックにまで課すと、既に稼働中の会計連携が鍵の長さ次第で
 * 突然繋がらなくなるため、挙動を変えない。
 */
function getStateSecret(): string {
  const primary = process.env.INTEGRATION_OAUTH_STATE_SECRET;
  if (primary) {
    if (primary.length < MIN_SECRET_LENGTH) {
      throw new Error(`INTEGRATION_OAUTH_STATE_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return primary;
  }
  return process.env.ACCOUNTING_OAUTH_STATE_SECRET ?? process.env.FREEE_CLIENT_SECRET ?? "";
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createOAuthState({
  tenantId,
  provider,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: {
  tenantId: string;
  provider: string;
  ttlSeconds?: number;
}): string {
  const secret = getStateSecret();
  if (!secret) throw new Error("Missing env: INTEGRATION_OAUTH_STATE_SECRET");

  const payloadObj: OAuthStatePayload = {
    tenantId,
    provider,
    nonce: randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const sig = signPayload(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyOAuthState({
  state,
  provider,
}: {
  state: string;
  provider: string;
}): { ok: true; tenantId: string } | { ok: false; reason: string } {
  let secret: string;
  try {
    secret = getStateSecret();
  } catch {
    return { ok: false, reason: "misconfigured_secret" };
  }
  if (!secret) return { ok: false, reason: "missing_secret" };

  const [payload, sig] = state.split(".");
  if (!payload || !sig) return { ok: false, reason: "malformed" };

  const expectedSig = signPayload(payload, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: "bad_signature" };
  }

  let parsed: OAuthStatePayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  if (!parsed.tenantId || !parsed.provider || !parsed.nonce || !parsed.exp)
    return { ok: false, reason: "incomplete_payload" };
  if (parsed.provider !== provider) return { ok: false, reason: "provider_mismatch" };
  if (parsed.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };

  return { ok: true, tenantId: parsed.tenantId };
}
