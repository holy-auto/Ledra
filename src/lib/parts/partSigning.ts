/**
 * 部品装着・確定署名のペイロード構築と署名（事業者署名型）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.3
 *
 * 既存の署名鍵基盤（src/lib/signature/crypto.ts）を流用し、装着の content_hash を
 * 本人(電話フルハッシュ)・装着ID・署名IDに束ねて署名する。
 */

import { signPayloadWithProvider } from "@/lib/signature/signer";

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

/**
 * ペイロードを構築しサーバ鍵で署名する。
 * 署名器抽象(SIGNER_PROVIDER=local 既定 / aws-kms で KMS)を使うため async。既定は現行と同一挙動。
 */
export async function signPartConfirmation(args: {
  contentHash: string;
  signedAt: string;
  installationId: string;
  signatureId: string;
  signerPhoneFullHash: string;
}): Promise<SignedConfirmation> {
  const signingPayload = buildPartSigningPayload(args);
  const signed = await signPayloadWithProvider(signingPayload);
  return {
    signingPayload,
    signature: signed.signature,
    publicKeyFingerprint: signed.publicKeyFingerprint,
    keyVersion: signed.keyVersion,
  };
}
