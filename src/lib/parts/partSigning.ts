/**
 * 部品装着・確定署名のペイロード構築と署名（事業者署名型）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.3
 *
 * 既存の署名鍵基盤（src/lib/signature/crypto.ts）を流用し、装着の content_hash を
 * 本人(電話フルハッシュ)・装着ID・署名IDに束ねて署名する。
 */

import { signPayload, getPrivateKey, getActiveKeyInfo } from "@/lib/signature/crypto";

export const PART_SIGNATURE_PAYLOAD_VERSION = "ledra-part-signature-v1";

/**
 * 署名対象ペイロード文字列を決定的に構築する。
 * content_hash（確定時点の装着内容）＋ 本人(電話フルハッシュ)＋ 装着ID＋署名IDを束ねる。
 */
export function buildPartSigningPayload(args: {
  contentHash: string;
  signedAt: string;
  installationId: string;
  signatureId: string;
  signerPhoneFullHash: string;
}): string {
  return [
    PART_SIGNATURE_PAYLOAD_VERSION,
    args.contentHash.toLowerCase(),
    args.signedAt,
    args.installationId.toLowerCase(),
    args.signatureId.toLowerCase(),
    args.signerPhoneFullHash.toLowerCase(),
  ].join(":");
}

export interface SignedConfirmation {
  signingPayload: string;
  signature: string;
  publicKeyFingerprint: string;
  keyVersion: string;
}

/** ペイロードを構築しサーバ鍵で署名する。 */
export function signPartConfirmation(args: {
  contentHash: string;
  signedAt: string;
  installationId: string;
  signatureId: string;
  signerPhoneFullHash: string;
}): SignedConfirmation {
  const signingPayload = buildPartSigningPayload(args);
  const signature = signPayload(signingPayload, getPrivateKey());
  const keyInfo = getActiveKeyInfo();
  return {
    signingPayload,
    signature,
    publicKeyFingerprint: keyInfo.fingerprint,
    keyVersion: keyInfo.version,
  };
}
