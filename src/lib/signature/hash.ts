/**
 * Ledra 電子署名 - ハッシュ計算・ペイロード構築
 *
 * 電子署名法第2条第2号（非改ざん性）の技術的基盤。
 * SHA-256 ハッシュにより文書の同一性を保証し、
 * 署名ペイロードの正規化により改ざん検知範囲を明確化する。
 */

import { createHash } from 'crypto';
import { createPublicKey } from 'crypto';

/**
 * PDF バイト列の SHA-256 ハッシュを計算する。
 *
 * これが電子署名法第2条第2号（非改ざん性）の核心実装。
 * 署名前・署名後の両時点でハッシュを記録・比較することで
 * 文書の改ざんを暗号的に検知できる。
 *
 * @param pdfBytes - PDF のバイト列
 * @returns 小文字 HEX 文字列形式の SHA-256 ハッシュ（64文字）
 */
export function computeDocumentHash(pdfBytes: Uint8Array): string {
  return createHash('sha256').update(pdfBytes).digest('hex');
}

/**
 * ECDSA P-256 公開鍵の SHA-256 フィンガープリントを計算する。
 *
 * 鍵ローテーション時に「どの公開鍵で検証すべきか」を
 * 署名レコードに紐付けるために使用する。
 *
 * @param publicKeyPem - PEM 形式の公開鍵
 * @returns 小文字 HEX 文字列形式の SHA-256 フィンガープリント（64文字）
 */
export function computePublicKeyFingerprint(publicKeyPem: string): string {
  const pubKey = createPublicKey(publicKeyPem);
  const der = pubKey.export({ type: 'spki', format: 'der' }) as Buffer;
  return createHash('sha256').update(der).digest('hex');
}

/**
 * 署名対象の正規化ペイロードを構築する。
 *
 * 各フィールドをコロン区切りで結合し、署名の対象範囲を明確に定義する。
 * このペイロードが ECDSA で署名され、改ざん検知の根拠となる。
 *
 * フォーマット:
 *   "ledra-signature-v1:{document_hash}:{signed_at}:{signer_email}:{certificate_id}:{session_id}"
 *
 * - "ledra-signature-v1" : バージョンプレフィックス（スキーマ変更時に v2 等へ更新）
 * - document_hash        : SHA-256(PDF) — 文書の同一性を保証
 * - signed_at            : ISO 8601 UTC — 署名時刻
 * - signer_email         : 署名者識別子（小文字・トリム正規化済み）
 * - certificate_id       : 証明書 UUID
 * - session_id           : 署名セッション UUID
 *
 * @param documentHash  - SHA-256(PDF) HEX
 * @param signedAt      - 署名日時 ISO 8601 UTC（例: "2026-04-03T12:34:56.789Z"）
 * @param signerEmail   - 署名者メールアドレス（正規化前でも可、内部で正規化）
 * @param certificateId - 証明書 UUID
 * @param sessionId     - 署名セッション UUID
 * @returns 正規化されたペイロード文字列
 */
export function buildSigningPayload(
  documentHash: string,
  signedAt: string,
  signerEmail: string,
  certificateId: string,
  sessionId: string,
): string {
  return [
    'ledra-signature-v1',
    documentHash.toLowerCase(),
    signedAt,
    signerEmail.toLowerCase().trim(),
    certificateId.toLowerCase(),
    sessionId.toLowerCase(),
  ].join(':');
}
