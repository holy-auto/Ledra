/**
 * 署名器の抽象化 — 秘密鍵をアプリの env から外して KMS へ移すための seam。
 *
 * アプリはダイジェスト(SHA-256)を渡して DER エンコードの ECDSA(P-256)署名を受け取るだけにし、
 * 鍵の所在(env の PEM か AWS KMS か)を隠蔽する。既定 SIGNER_PROVIDER=local では現行と完全に
 * 同じ挙動(同じ env 鍵・同じ検証互換)。aws-kms では KMS が鍵を保持し、アプリは鍵を取得できない。
 *
 * 署名フォーマット: local(Node crypto)も KMS(ECDSA_SHA_256)も DER 出力なので、既存の
 * verifySignature(createVerify('SHA256'))・既存公開鍵でそのまま検証できる。
 */

import { createHash, sign as cryptoSign } from "crypto";
import { getPrivateKey, getActiveKeyInfo } from "./crypto";
import type { ActiveKeyInfo } from "./types";

export type SignerProvider = "local" | "aws-kms";

export function signerProvider(): SignerProvider {
  const v = (process.env.SIGNER_PROVIDER ?? "local").trim().toLowerCase();
  return v === "aws-kms" ? "aws-kms" : "local";
}

export interface Signer {
  /** メッセージ(payload バイト列)に対する DER エンコード ECDSA-SHA256(P-256)署名を返す。 */
  sign(message: Buffer): Promise<Buffer>;
  getKeyInfo(): ActiveKeyInfo;
  readonly provider: SignerProvider;
}

/** env の PEM 秘密鍵で署名する(現行挙動)。 */
class LocalPemSigner implements Signer {
  readonly provider = "local" as const;
  async sign(message: Buffer): Promise<Buffer> {
    // Node の ECDSA はハッシュを内部で行う。sign('sha256', msg) で createSign('SHA256')/
    // createVerify('SHA256') と同形式の DER 署名を出力する(dsaEncoding:'der')。
    return cryptoSign("sha256", message, { key: getPrivateKey(), dsaEncoding: "der" });
  }
  getKeyInfo(): ActiveKeyInfo {
    return getActiveKeyInfo();
  }
}

/** AWS KMS の非対称鍵(ECC_NIST_P256)で署名する。秘密鍵はアプリに出てこない。 */
class KmsSigner implements Signer {
  readonly provider = "aws-kms" as const;
  constructor(private readonly keyId: string) {}
  async sign(message: Buffer): Promise<Buffer> {
    // ローカルと同じ「SHA-256 → ECDSA(DER)」にするため、ダイジェストを渡し MessageType=DIGEST
    // で署名する(KMS は再ハッシュしない)。動的 import で aws-kms モード時のみ SDK をロード。
    const digest = createHash("sha256").update(message).digest();
    const { KMSClient, SignCommand } = await import("@aws-sdk/client-kms");
    const client = new KMSClient({}); // region/認証情報は環境(IAM ロール/OIDC)から解決
    const res = await client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: digest,
        MessageType: "DIGEST",
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );
    if (!res.Signature) throw new Error("[signer] KMS が署名を返しませんでした。");
    return Buffer.from(res.Signature); // DER
  }
  getKeyInfo(): ActiveKeyInfo {
    // 公開鍵は KMS の公開鍵を env(LEDRA_SIGNING_PUBLIC_KEY)/registry に入れて運用する
    // (検証はローカルのまま)。fingerprint/version はそこから算出する。
    return getActiveKeyInfo();
  }
}

let cached: Signer | null = null;

/** 現在の SIGNER_PROVIDER に応じた署名器を返す(プロセス内キャッシュ)。 */
export function getSigner(): Signer {
  const provider = signerProvider();
  if (cached && cached.provider === provider) return cached;
  if (provider === "aws-kms") {
    const keyId = process.env.KMS_SIGNING_KEY_ID?.trim();
    if (!keyId) {
      throw new Error("[signer] SIGNER_PROVIDER=aws-kms には KMS_SIGNING_KEY_ID(鍵 ARN/ID)が必要です。");
    }
    cached = new KmsSigner(keyId);
  } else {
    cached = new LocalPemSigner();
  }
  return cached;
}

export interface SignedPayload {
  /** base64(DER ECDSA-P256) 署名。verifySignature でそのまま検証できる。 */
  signature: string;
  keyVersion: string;
  publicKeyFingerprint: string;
  provider: SignerProvider;
}

/**
 * payload を SHA-256 → 署名器(local/KMS)で DER 署名 → base64。
 * 既存の signPayload(payload, getPrivateKey()) を置き換える非同期の署名入口。
 */
export async function signPayloadWithProvider(payload: string): Promise<SignedPayload> {
  const signer = getSigner();
  const sig = await signer.sign(Buffer.from(payload, "utf8"));
  const keyInfo = signer.getKeyInfo();
  return {
    signature: sig.toString("base64"),
    keyVersion: keyInfo.version,
    publicKeyFingerprint: keyInfo.fingerprint,
    provider: signer.provider,
  };
}
