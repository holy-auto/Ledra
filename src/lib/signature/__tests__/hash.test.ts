/**
 * hash.ts のユニットテスト
 * 電子署名法第2条第2号（非改ざん性）の核心ロジックを検証
 */

import { computeDocumentHash, buildSigningPayload } from '../hash';

describe('computeDocumentHash', () => {
  it('同一入力に対して常に同一のハッシュを返す', () => {
    const bytes = new TextEncoder().encode('test pdf content');
    const hash1 = computeDocumentHash(bytes);
    const hash2 = computeDocumentHash(bytes);
    expect(hash1).toBe(hash2);
  });

  it('SHA-256 ハッシュは64文字の HEX 文字列である', () => {
    const bytes = new TextEncoder().encode('test');
    const hash = computeDocumentHash(bytes);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('1バイトの変更でハッシュが変わる（非改ざん性の保証）', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const tampered  = new Uint8Array([1, 2, 3, 4, 6]); // 最後の1バイトだけ変更
    expect(computeDocumentHash(original)).not.toBe(computeDocumentHash(tampered));
  });

  it('空のバイト列でも正常にハッシュを返す', () => {
    const hash = computeDocumentHash(new Uint8Array([]));
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('buildSigningPayload', () => {
  const baseArgs = {
    documentHash:  'abc123def456',
    signedAt:      '2026-04-03T12:34:56.789Z',
    signerEmail:   'test@example.com',
    certificateId: '11111111-1111-1111-1111-111111111111',
    sessionId:     '22222222-2222-2222-2222-222222222222',
  };

  it('正しいフォーマットのペイロードを生成する', () => {
    const payload = buildSigningPayload(
      baseArgs.documentHash,
      baseArgs.signedAt,
      baseArgs.signerEmail,
      baseArgs.certificateId,
      baseArgs.sessionId,
    );
    expect(payload).toBe(
      'ledra-signature-v1:abc123def456:2026-04-03T12:34:56.789Z:test@example.com:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222',
    );
  });

  it('バージョンプレフィックス "ledra-signature-v1" で始まる', () => {
    const payload = buildSigningPayload(
      baseArgs.documentHash,
      baseArgs.signedAt,
      baseArgs.signerEmail,
      baseArgs.certificateId,
      baseArgs.sessionId,
    );
    expect(payload).toMatch(/^ledra-signature-v1:/);
  });

  it('メールアドレスを小文字・トリム正規化する', () => {
    const payload = buildSigningPayload(
      baseArgs.documentHash,
      baseArgs.signedAt,
      '  TEST@EXAMPLE.COM  ',  // 大文字・スペースあり
      baseArgs.certificateId,
      baseArgs.sessionId,
    );
    expect(payload).toContain(':test@example.com:');
  });

  it('ドキュメントハッシュを小文字正規化する', () => {
    const payload = buildSigningPayload(
      'ABC123DEF456',  // 大文字
      baseArgs.signedAt,
      baseArgs.signerEmail,
      baseArgs.certificateId,
      baseArgs.sessionId,
    );
    expect(payload).toContain(':abc123def456:');
  });

  it('フィールドが異なれば異なるペイロードになる', () => {
    const payload1 = buildSigningPayload(
      'hash1', baseArgs.signedAt, baseArgs.signerEmail,
      baseArgs.certificateId, baseArgs.sessionId,
    );
    const payload2 = buildSigningPayload(
      'hash2', baseArgs.signedAt, baseArgs.signerEmail,
      baseArgs.certificateId, baseArgs.sessionId,
    );
    expect(payload1).not.toBe(payload2);
  });
});
