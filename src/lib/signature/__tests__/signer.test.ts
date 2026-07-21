import { describe, it, expect, beforeEach } from "vitest";
import { generateKeyPairSync } from "crypto";
import { signPayloadWithProvider, getSigner, signerProvider } from "../signer";
import { verifySignature } from "../crypto";

// テスト用の EC P-256 鍵ペア(本番鍵は使わない)。
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

beforeEach(() => {
  process.env.LEDRA_SIGNING_PRIVATE_KEY = privateKey;
  process.env.LEDRA_SIGNING_PUBLIC_KEY = publicKey;
  process.env.LEDRA_SIGNING_KEY_VERSION = "vtest";
  delete process.env.SIGNER_PROVIDER;
  delete process.env.KMS_SIGNING_KEY_ID;
});

describe("signPayloadWithProvider (local)", () => {
  it("既存 verifySignature で検証できる DER ECDSA 署名を出す(local⇔KMS 互換の根拠)", async () => {
    const payload = "ledra-signature-v1:deadbeef:2026-07-21T00:00:00.000Z:a@example.com";
    const signed = await signPayloadWithProvider(payload);

    expect(signed.provider).toBe("local");
    expect(signed.keyVersion).toBe("vtest");
    expect(typeof signed.publicKeyFingerprint).toBe("string");
    // 出力 base64 署名が現行の検証関数・現行の公開鍵でそのまま通る = 置換互換。
    expect(verifySignature(payload, signed.signature, publicKey)).toBe(true);
    // 改ざん(ペイロード変更)は検知される。
    expect(verifySignature(payload + "x", signed.signature, publicKey)).toBe(false);
  });

  it("既定は local。aws-kms は KMS_SIGNING_KEY_ID 未設定なら明示エラー", () => {
    expect(signerProvider()).toBe("local");
    expect(getSigner().provider).toBe("local");

    process.env.SIGNER_PROVIDER = "aws-kms";
    expect(signerProvider()).toBe("aws-kms");
    expect(() => getSigner()).toThrow(/KMS_SIGNING_KEY_ID/);
  });
});
