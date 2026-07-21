/**
 * WebAuthn クレデンシャルの純粋変換ヘルパ(DB 非依存・単体テスト対象)。
 *
 * バイナリ(公開鍵・authenticatorData 等)は postgREST 越しの bytea 取り回しを避けるため
 * base64url TEXT で保存する。検証時に Uint8Array へ戻す。
 */

/** Uint8Array → base64url 文字列。 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** base64url 文字列 → Uint8Array(ArrayBuffer 裏付け。@simplewebauthn の型に合わせる)。 */
export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(s, "base64url");
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/** verifyRegistrationResponse().registrationInfo の必要部分(バージョン差異を吸収する最小形)。 */
export interface RegistrationInfoLike {
  credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: string[];
  };
  aaguid?: string;
  credentialDeviceType?: "singleDevice" | "multiDevice";
  credentialBackedUp?: boolean;
}

export interface OperatorCredentialInsert {
  tenant_id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  aaguid: string | null;
  device_type: string | null;
  backed_up: boolean;
  device_label: string | null;
}

/** 検証済み登録情報から operator_credentials への INSERT 行を組み立てる。 */
export function buildOperatorCredentialInsert(
  info: RegistrationInfoLike,
  args: { tenantId: string; userId: string; deviceLabel?: string | null },
): OperatorCredentialInsert {
  const aaguid = info.aaguid && info.aaguid !== "00000000-0000-0000-0000-000000000000" ? info.aaguid : null;
  return {
    tenant_id: args.tenantId,
    user_id: args.userId,
    credential_id: info.credential.id,
    public_key: bytesToBase64Url(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports?.length ? info.credential.transports : null,
    aaguid,
    device_type: info.credentialDeviceType ?? null,
    backed_up: info.credentialBackedUp ?? false,
    device_label: args.deviceLabel?.trim() || null,
  };
}

/** 保存済みクレデンシャル行を verifyAuthenticationResponse() の `credential` 形へ戻す。 */
export function toWebAuthnCredential(row: {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
}): { id: string; publicKey: Uint8Array<ArrayBuffer>; counter: number; transports?: string[] } {
  return {
    id: row.credential_id,
    publicKey: base64UrlToBytes(row.public_key),
    counter: row.counter,
    ...(row.transports?.length ? { transports: row.transports } : {}),
  };
}
