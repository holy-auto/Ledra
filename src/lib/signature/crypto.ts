/**
 * Ledra 電子署名 - ECDSA P-256 署名・検証
 *
 * 電子署名法第2条第2号（非改ざん性）の暗号技術的実装。
 * Node.js 標準 `crypto` モジュールの ECDSA P-256 を使用する。
 *
 * アルゴリズム選定根拠:
 * - RSA-2048 比で鍵サイズが小さく処理が高速
 * - 署名サイズが 64 byte（RSA-2048 の 1/4）
 * - Node.js `crypto` モジュール標準サポート
 * - NIST P-256 曲線は国際標準（FIPS 186-4）
 */

import { createSign, createVerify, createPublicKey } from 'crypto';
import { computePublicKeyFingerprint } from './hash';
import type { ActiveKeyInfo } from './types';

/**
 * ECDSA P-256 署名を生成する。
 *
 * Ledra の秘密鍵（LEDRA_SIGNING_PRIVATE_KEY 環境変数）を使用して
 * 署名ペイロードに対する ECDSA 署名を生成する。
 * これが電子署名法第2条第2号（非改ざん性）の技術的実装本体。
 *
 * @param payload    - 署名対象文字列（buildSigningPayload() の出力）
 * @param privateKey - PEM 形式の ECDSA P-256 秘密鍵
 * @returns Base64 エンコードされた署名値
 */
export function signPayload(payload: string, privateKey: string): string {
  const sign = createSign('SHA256');
  sign.update(payload, 'utf8');
  sign.end();
  return sign.sign(privateKey, 'base64');
}

/**
 * ECDSA 署名を検証する。
 *
 * 署名ペイロード・署名値・公開鍵の3点セットで検証する。
 * 以下のいずれかの場合に false を返す（例外は投げない）:
 * - 署名が改ざんされている
 * - ペイロードが改ざんされている
 * - 不正な鍵・署名フォーマット
 *
 * @param payload   - 署名対象文字列（元の buildSigningPayload() の出力と完全一致必須）
 * @param signature - Base64 エンコードされた署名値
 * @param publicKey - PEM 形式の ECDSA P-256 公開鍵
 * @returns 署名が有効なら true、無効・エラーなら false
 */
export function verifySignature(
  payload: string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const verify = createVerify('SHA256');
    verify.update(payload, 'utf8');
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch {
    // 不正な署名・鍵フォーマットの場合は例外ではなく false を返す
    return false;
  }
}

/**
 * 環境変数から秘密鍵文字列を取得する。
 *
 * Vercel 環境変数では改行を "\n" としてエスケープして登録するため、
 * 取得時に実際の改行文字に復元する。
 *
 * @throws {Error} LEDRA_SIGNING_PRIVATE_KEY が未設定の場合
 */
export function getPrivateKey(): string {
  const key = process.env.LEDRA_SIGNING_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      '[signature] LEDRA_SIGNING_PRIVATE_KEY is not set. ' +
      'Set it in Vercel environment variables.',
    );
  }
  return key.replace(/\\n/g, '\n');
}

/**
 * 環境変数から公開鍵文字列を取得する。
 *
 * @throws {Error} LEDRA_SIGNING_PUBLIC_KEY が未設定の場合
 */
export function getPublicKey(): string {
  const key = process.env.LEDRA_SIGNING_PUBLIC_KEY;
  if (!key) {
    throw new Error(
      '[signature] LEDRA_SIGNING_PUBLIC_KEY is not set. ' +
      'Set it in Vercel environment variables.',
    );
  }
  return key.replace(/\\n/g, '\n');
}

/**
 * 現在アクティブな鍵のバージョンとフィンガープリントを返す。
 *
 * 署名レコードに key_version と public_key_fingerprint を
 * 記録するために使用する。これにより鍵ローテーション後も
 * 正しい公開鍵で署名を検証できる。
 */
export function getActiveKeyInfo(): ActiveKeyInfo {
  const publicKey = getPublicKey();
  return {
    version: process.env.LEDRA_SIGNING_KEY_VERSION ?? 'v1',
    fingerprint: computePublicKeyFingerprint(publicKey),
  };
}

/**
 * 公開鍵の有効性を簡易検証する（起動時チェック用）。
 *
 * PEM フォーマットが正しく ECDSA P-256 鍵として解析できるかを確認する。
 * @returns true = 正常, false = 不正
 */
export function validatePublicKeyFormat(publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === 'ec';
  } catch {
    return false;
  }
}
