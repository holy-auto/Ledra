/**
 * WebAuthn RP 設定 + 操作署名フィーチャーフラグ。
 *
 * RP ID / origin はアプリの公開 URL(NEXT_PUBLIC_APP_URL)から導出する。明示上書きが
 * 必要な場合のみ WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN を設定する(複数 origin はカンマ区切り)。
 */

export type OperationSigningMode = "off" | "optional" | "enforce";

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  /** 検証時に許可する origin(1 つ以上)。 */
  origins: string[];
  /** UI/クライアントに返す primary origin。 */
  origin: string;
}

function baseUrl(): string {
  return (
    process.env.WEBAUTHN_ORIGIN?.split(",")[0]?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    ""
  );
}

/**
 * RP 設定を解決する。RP ID/origin が導出できない場合は明示的に throw する
 * (設定不備のまま WebAuthn を実行して曖昧に失敗させない)。
 */
export function getWebAuthnConfig(): WebAuthnConfig {
  const primary = baseUrl();
  if (!primary) {
    throw new Error("[webauthn] origin を導出できません。NEXT_PUBLIC_APP_URL か WEBAUTHN_ORIGIN を設定してください。");
  }
  const origins = (process.env.WEBAUTHN_ORIGIN ?? primary)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const rpID = process.env.WEBAUTHN_RP_ID?.trim() || new URL(primary).hostname;
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "Ledra";
  return { rpID, rpName, origins, origin: origins[0] ?? primary };
}

/**
 * 重要操作への WebAuthn 本人確認の強制レベル。
 *   off      … 操作署名を要求しない(既定)
 *   optional … 登録済み認証器があれば要求、無ければ従来どおり許可(assurance を記録)
 *   enforce  … 必須(未登録者は操作不可)
 */
export function operationSigningMode(): OperationSigningMode {
  const v = (process.env.WEBAUTHN_OPERATION_SIGNING ?? "off").trim().toLowerCase();
  return v === "optional" || v === "enforce" ? v : "off";
}

/** 登録チャレンジの有効期限(ms)。 */
export const REGISTRATION_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** 操作署名チャレンジの有効期限(ms)。短め。 */
export const OPERATION_CHALLENGE_TTL_MS = 2 * 60 * 1000;
