/**
 * Google Play Integrity 検証（Android 端末アテステーション）。
 *
 * 端末が生成した integrity token を **Google の decodeIntegrityToken API** に渡して
 * 復号・検証させる（トークン自体の暗号検証は Google 側に委譲＝自前の鍵管理不要）。
 * 返ってきた verdict と、我々が発行した撮影nonce（token 生成時に requestHash として
 * 束縛させる）を照合し、「正規アプリ・正規端末が、この nonce のために」生成した token で
 * あることを確認する。
 *
 * fail-closed: 未設定・API エラー・verdict 不十分・nonce 不一致はすべて未検証で返す。
 *
 * Env:
 *   DEVICE_ATTESTATION_ENABLED  = "true" で有効化（dispatcher 側で判定）
 *   PLAY_INTEGRITY_PACKAGE_NAME = 対象アプリの applicationId（例 com.ledra.app）
 *   PLAY_INTEGRITY_SA_JSON      = サービスアカウント鍵の JSON（inline）。未設定なら
 *                                 GOOGLE_APPLICATION_CREDENTIALS 等の ADC にフォールバック。
 *   PLAY_INTEGRITY_MAX_AGE_MS   = token の許容鮮度（既定 10 分）
 */

import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/playintegrity";
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

export interface PlayIntegrityVerification {
  verified: boolean;
  reason: string | null;
}

let cachedAuth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  const inline = process.env.PLAY_INTEGRITY_SA_JSON;
  cachedAuth = new GoogleAuth({
    scopes: [SCOPE],
    ...(inline ? { credentials: JSON.parse(inline) } : {}),
  });
  return cachedAuth;
}

interface DecodedTokenPayload {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string };
  appIntegrity?: { appRecognitionVerdict?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
}

/**
 * integrity token を Google に復号させ、verdict と nonce 束縛を検証する。
 * @param expectedNonce cert 作成時にサーバ発行した撮影nonce（クライアントが token の
 *        requestHash に設定している想定）。
 */
export async function verifyPlayIntegrity(
  token: string,
  expectedNonce: string | null | undefined,
): Promise<PlayIntegrityVerification> {
  const packageName = process.env.PLAY_INTEGRITY_PACKAGE_NAME;
  if (!packageName) return { verified: false, reason: "play_integrity_not_configured" };
  if (!token) return { verified: false, reason: "missing_token" };
  if (!expectedNonce) return { verified: false, reason: "missing_nonce" };

  try {
    const client = await getAuth().getClient();
    const url = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`;
    const res = await client.request<{ tokenPayloadExternal?: DecodedTokenPayload }>({
      url,
      method: "POST",
      data: { integrity_token: token },
    });

    const payload = res.data?.tokenPayloadExternal;
    if (!payload) return { verified: false, reason: "empty_payload" };

    const rd = payload.requestDetails ?? {};
    // 対象アプリと nonce 束縛（別アプリ・別 cert 用 token の流用を弾く）。
    if (rd.requestPackageName !== packageName) return { verified: false, reason: "package_mismatch" };
    if (rd.requestHash !== expectedNonce) return { verified: false, reason: "nonce_mismatch" };

    // 鮮度（事前生成 token の使い回しを制限）。
    const maxAge = Number(process.env.PLAY_INTEGRITY_MAX_AGE_MS ?? DEFAULT_MAX_AGE_MS);
    const ts = Number(rd.timestampMillis ?? 0);
    if (!ts || Date.now() - ts > maxAge) return { verified: false, reason: "stale_token" };

    // 正規アプリ配布 + 端末インテグリティ。
    if (payload.appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") {
      return { verified: false, reason: "app_not_recognized" };
    }
    const device = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    if (!device.includes("MEETS_DEVICE_INTEGRITY")) {
      return { verified: false, reason: "device_integrity_failed" };
    }

    return { verified: true, reason: null };
  } catch (err) {
    console.warn("[play-integrity] verify failed", err instanceof Error ? err.message : err);
    return { verified: false, reason: "play_integrity_error" };
  }
}
