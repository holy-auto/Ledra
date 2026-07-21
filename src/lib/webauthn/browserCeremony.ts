/**
 * WebAuthn ブラウザセレモニー(navigator.credentials)のクライアント側ヘルパ。
 *
 * サーバの register/operation ルートが返す JSON をそのまま @simplewebauthn/browser に渡し、
 * その戻り値を verify ルートへ返す薄いラッパ。既存の raw fetch + parseJsonSafe 慣習に合わせる。
 * すべて same-origin cookie 認証(resolveCallerWithRole)なので追加トークンは不要。
 */

"use client";

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { parseJsonSafe } from "@/lib/api/safeJson";
import type { OperationSigningMode } from "@/lib/webauthn/config";
import type { OperationType } from "@/lib/webauthn/operation";

export interface PasskeyRow {
  id: string;
  device_label: string | null;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

async function jsonOrThrow(res: Response, fallback: string): Promise<Record<string, unknown>> {
  const json = (await parseJsonSafe(res)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = (json?.message as string) || (json?.error as string) || fallback;
    throw new Error(msg);
  }
  return json ?? {};
}

/** WebAuthn がこのブラウザで使えるか(SSR/未対応環境の早期分岐用)。 */
export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** パスキー登録セレモニー: options → navigator.credentials.create → verify。 */
export async function registerPasskey(deviceLabel?: string): Promise<{ credentialId: string }> {
  const optJson = await jsonOrThrow(
    await fetch("/api/webauthn/register/options", { method: "POST" }),
    "登録オプションの取得に失敗しました",
  );
  const attResp = await startRegistration({
    optionsJSON: optJson.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
  });
  const verJson = await jsonOrThrow(
    await fetch("/api/webauthn/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: attResp, device_label: deviceLabel?.trim() || undefined }),
    }),
    "パスキーの登録に失敗しました",
  );
  return { credentialId: verJson.credential_id as string };
}

/** 登録済みパスキー一覧 + 操作署名モードを取得。 */
export async function listPasskeys(): Promise<{ credentials: PasskeyRow[]; mode: OperationSigningMode }> {
  const json = await jsonOrThrow(
    await fetch("/api/webauthn/credentials", { cache: "no-store" }),
    "パスキー一覧の取得に失敗しました",
  );
  return {
    credentials: (json.credentials as PasskeyRow[]) ?? [],
    mode: (json.operation_signing_mode as OperationSigningMode) ?? "off",
  };
}

/** パスキーを失効(ソフト削除)。 */
export async function revokePasskey(id: string): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/webauthn/credentials/${encodeURIComponent(id)}`, { method: "DELETE" }),
    "パスキーの失効に失敗しました",
  );
}

/**
 * 操作署名セレモニー: options(payload_hash=challenge) → navigator.credentials.get → verify。
 * 成功で challenge_id を返す。呼び出し元は業務操作(finalize/void 等)にこれを添えて送る。
 * 証明書は internal UUID か public_id のどちらでも指定可(サーバが UUID に解決)。
 */
export async function signOperation(
  operationType: OperationType,
  cert: { certificateId?: string; publicId?: string },
): Promise<{ challengeId: string }> {
  const optJson = await jsonOrThrow(
    await fetch("/api/webauthn/operation/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation_type: operationType,
        certificate_id: cert.certificateId,
        public_id: cert.publicId,
      }),
    }),
    "操作署名オプションの取得に失敗しました",
  );
  const asseResp = await startAuthentication({
    optionsJSON: optJson.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
  });
  const verJson = await jsonOrThrow(
    await fetch("/api/webauthn/operation/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_id: optJson.challenge_id, response: asseResp }),
    }),
    "操作署名の検証に失敗しました",
  );
  return { challengeId: verJson.challenge_id as string };
}
