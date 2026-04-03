/**
 * crypto.ts のユニットテスト
 * ECDSA P-256 署名・検証のラウンドトリップと改ざん検知を検証
 */

import { generateKeyPairSync } from 'crypto';
import { signPayload, verifySignature } from '../crypto';

// テスト用 ECDSA P-256 鍵ペアを生成（テスト実行時のみ）
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } =
  generateKeyPairSync('ec', {
    namedCurve:       'P-256',
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'sec1',  format: 'pem' },
  });

const TEST_PAYLOAD =
  'ledra-signature-v1:abc123:2026-04-03T12:00:00.000Z:test@example.com:cert-id:session-id';

describe('signPayload / verifySignature - ラウンドトリップ', () => {
  it('署名したペイロードを正しく検証できる', () => {
    const signature = signPayload(TEST_PAYLOAD, TEST_PRIVATE_KEY);
    const isValid   = verifySignature(TEST_PAYLOAD, signature, TEST_PUBLIC_KEY);
    expect(isValid).toBe(true);
  });

  it('署名は Base64 文字列として返される', () => {
    const signature = signPayload(TEST_PAYLOAD, TEST_PRIVATE_KEY);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
    // Base64 文字セットのみ含む
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('verifySignature - 改ざん検知', () => {
  it('ペイロードが1文字でも変わると検証が失敗する', () => {
    const signature       = signPayload(TEST_PAYLOAD, TEST_PRIVATE_KEY);
    const tamperedPayload = TEST_PAYLOAD + 'X';  // 末尾に1文字追加
    const isValid         = verifySignature(tamperedPayload, signature, TEST_PUBLIC_KEY);
    expect(isValid).toBe(false);
  });

  it('署名値が1文字変わると検証が失敗する', () => {
    const signature = signPayload(TEST_PAYLOAD, TEST_PRIVATE_KEY);
    // Base64 文字列の最初の1文字を変える
    const tamperedSig = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    const isValid     = verifySignature(TEST_PAYLOAD, tamperedSig, TEST_PUBLIC_KEY);
    expect(isValid).toBe(false);
  });

  it('異なる鍵ペアの署名は検証が失敗する', () => {
    const { privateKey: otherPrivate, publicKey: otherPublic } =
      generateKeyPairSync('ec', {
        namedCurve:       'P-256',
        publicKeyEncoding:  { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'sec1', format: 'pem' },
      });

    const signatureByOther = signPayload(TEST_PAYLOAD, otherPrivate);
    // TEST_PUBLIC_KEY では検証できない
    const isValid = verifySignature(TEST_PAYLOAD, signatureByOther, TEST_PUBLIC_KEY);
    expect(isValid).toBe(false);

    // 正しい公開鍵では検証できる
    const isValidWithCorrectKey = verifySignature(TEST_PAYLOAD, signatureByOther, otherPublic);
    expect(isValidWithCorrectKey).toBe(true);
  });

  it('不正な署名文字列でも例外を投げず false を返す', () => {
    expect(() => {
      const result = verifySignature(TEST_PAYLOAD, 'not-a-valid-signature', TEST_PUBLIC_KEY);
      expect(result).toBe(false);
    }).not.toThrow();
  });

  it('空文字の署名でも例外を投げず false を返す', () => {
    expect(() => {
      const result = verifySignature(TEST_PAYLOAD, '', TEST_PUBLIC_KEY);
      expect(result).toBe(false);
    }).not.toThrow();
  });
});
