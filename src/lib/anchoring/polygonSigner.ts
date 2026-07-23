/**
 * Polygon(secp256k1)署名器の抽象 — 署名鍵を env から外して AWS KMS へ移す seam。
 *
 * 既定 `POLYGON_SIGNER_PROVIDER=local` は現行と完全に同一挙動(viem の privateKeyToAccount で
 * `POLYGON_PRIVATE_KEY` を使用)。`aws-kms` では KMS(鍵スペック ECC_SECG_P256K1)が秘密鍵を保持し、
 * アプリは鍵を取得できない。viem の `toAccount` でカスタムアカウントを組み、署名は KMS の
 * `Sign`(MessageType=DIGEST)へ委譲する。
 *
 * ⚠ 重要な運用前提(cutover 前に必須):
 *   KMS 鍵の Ethereum アドレスは現行 `POLYGON_PRIVATE_KEY` のアドレスと **異なる**。切替前に
 *   (1) 各アンカーコントラクトの anchorer allowlist へ KMS アドレスを登録し、(2) その新ウォレットへ
 *   POL を入金しておく必要がある。未対応のまま切り替えると anchor/anchorBatch が revert する。
 *   これらは AWS/コントラクト側の運用作業のため、本フラグは既定 off(local)で inert。
 *
 * 署名器互換: Ethereum tx は keccak256 ダイジェストを secp256k1 で署名する。KMS は DER 署名を返すので
 *   (a) low-S 正規化(EIP-2)し (b) 復元ビット v を「復元アドレス == 鍵アドレス」で総当り決定する。
 *   ロジックは `recoverEthSignature`(純関数)に分離し、AWS 無しでローカル往復テスト可能にしている。
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  keccak256,
  serializeSignature,
  serializeTransaction,
  hashMessage,
  hashTypedData,
  hexToBytes,
  toHex,
  type Account,
  type Address,
  type Hex,
} from "viem";
import { publicKeyToAddress } from "viem/utils";

export type PolygonSignerProvider = "local" | "aws-kms";

/** 現在の Polygon 署名プロバイダ(既定 local)。 */
export function polygonSignerProvider(): PolygonSignerProvider {
  const v = (process.env.POLYGON_SIGNER_PROVIDER ?? "local").trim().toLowerCase();
  return v === "aws-kms" ? "aws-kms" : "local";
}

/**
 * `POLYGON_PRIVATE_KEY` を viem が受け付ける `0x`+64桁hex に正規化する（純関数）。
 * よくある形式ミス（`0x` プレフィックス無し・前後の空白・大文字）を吸収し、不正なら null を返す。
 * viem の `privateKeyToAccount` は `0x`+64hex 以外を "invalid private key, expected hex or 32 bytes,
 * got string" で落とすため、これを通してから渡すことで monitor/anchor が cryptic に失敗し続けるのを防ぐ。
 */
export function normalizePolygonPrivateKey(raw: string | undefined | null): `0x${string}` | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  return /^[0-9a-fA-F]{64}$/.test(hex) ? (`0x${hex.toLowerCase()}` as `0x${string}`) : null;
}

const SECP256K1_N = secp256k1.CURVE.n;

/** bigint を 32byte 0x-hex に。 */
function toHex32(x: bigint): Hex {
  return `0x${x.toString(16).padStart(64, "0")}`;
}

export interface EthSignature {
  r: Hex;
  s: Hex;
  yParity: 0 | 1;
}

/**
 * KMS が返す DER ECDSA 署名を、Ethereum が要求する {r, s(low-S), yParity} へ変換する純関数。
 * yParity は「復元した公開鍵アドレスが期待アドレスと一致する」復元ビットとして決定する。
 * @param der KMS Sign が返す DER 署名バイト列
 * @param digest 署名対象の 32byte ダイジェスト(0x-hex、keccak256 等)
 * @param expectedAddress KMS 鍵の Ethereum アドレス(照合用)
 */
export function recoverEthSignature(der: Uint8Array, digest: Hex, expectedAddress: Address): EthSignature {
  const digestHex = digest.slice(2);
  const sig = secp256k1.Signature.fromDER(der).normalizeS(); // EIP-2: low-S を強制
  for (const rec of [0, 1] as const) {
    const recovered = sig.addRecoveryBit(rec).recoverPublicKey(digestHex).toRawBytes(false);
    const addr = publicKeyToAddress(toHex(recovered));
    if (addr.toLowerCase() === expectedAddress.toLowerCase()) {
      return { r: toHex32(sig.r), s: toHex32(sig.s), yParity: rec };
    }
  }
  throw new Error("[polygon-signer] 復元ビット v を決定できませんでした(署名がこの鍵で作られていない)。");
}

/**
 * KMS `GetPublicKey` が返す SPKI(DER)から Ethereum アドレスを導出する。
 * secp256k1 の SPKI は末尾が非圧縮点 04||X||Y(65byte)なので、その 65byte を取り出して導出する。
 */
export function spkiToAddress(spki: Uint8Array): Address {
  const point = spki.slice(spki.length - 65);
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("[polygon-signer] KMS 公開鍵(SPKI)から非圧縮点 04||X||Y を取り出せませんでした。");
  }
  return publicKeyToAddress(toHex(point));
}

/** KMS で 32byte ダイジェストを署名し、Ethereum 署名 {r,s,yParity} を返す。 */
async function kmsSignDigest(keyId: string, digest: Hex, expectedAddress: Address): Promise<EthSignature> {
  const { KMSClient, SignCommand } = await import("@aws-sdk/client-kms");
  const client = new KMSClient({}); // region/認証は環境(IAM ロール/OIDC)から解決
  const res = await client.send(
    new SignCommand({
      KeyId: keyId,
      Message: hexToBytes(digest),
      MessageType: "DIGEST",
      SigningAlgorithm: "ECDSA_SHA_256", // secp256k1 の DIGEST 署名。KMS は再ハッシュしない(32byte をそのまま署名)
    }),
  );
  if (!res.Signature) throw new Error("[polygon-signer] KMS が署名を返しませんでした。");
  return recoverEthSignature(Buffer.from(res.Signature), digest, expectedAddress);
}

/** KMS 鍵で backing された viem カスタムアカウントを組む(公開鍵取得は一度きり)。 */
async function createKmsAccount(keyId: string): Promise<Account> {
  const { KMSClient, GetPublicKeyCommand } = await import("@aws-sdk/client-kms");
  const client = new KMSClient({});
  const pub = await client.send(new GetPublicKeyCommand({ KeyId: keyId }));
  if (!pub.PublicKey) throw new Error("[polygon-signer] KMS の公開鍵(SPKI)を取得できませんでした。");
  const address = spkiToAddress(Buffer.from(pub.PublicKey));

  const { toAccount } = await import("viem/accounts");
  return toAccount({
    address,
    async signTransaction(transaction, options) {
      const serializer = options?.serializer ?? serializeTransaction;
      const serialized = await serializer(transaction); // 署名前 tx を serialize(viem 型は MaybePromise)
      const sig = await kmsSignDigest(keyId, keccak256(serialized), address);
      return serializer(transaction, sig);
    },
    async signMessage({ message }) {
      // アンカリング経路では未使用だが型契約(CustomSource)を満たすため実装(EIP-191)。
      return serializeSignature(await kmsSignDigest(keyId, hashMessage(message), address));
    },
    async signTypedData(typedData) {
      // 同上(EIP-712)。未使用だが正しく実装しておく。
      return serializeSignature(await kmsSignDigest(keyId, hashTypedData(typedData), address));
    },
  });
}

/**
 * 現在の `POLYGON_SIGNER_PROVIDER` に応じた viem アカウントを返す。
 * local: `privateKeyToAccount(privateKey)`(現行挙動)。aws-kms: KMS backing のカスタムアカウント。
 * @param privateKey local モードで使う 0x-hex 秘密鍵(aws-kms では無視)
 */
export async function getPolygonAccount(privateKey: string | undefined): Promise<Account> {
  if (polygonSignerProvider() === "aws-kms") {
    const keyId = process.env.POLYGON_KMS_KEY_ID?.trim();
    if (!keyId) {
      throw new Error(
        "[polygon-signer] POLYGON_SIGNER_PROVIDER=aws-kms には POLYGON_KMS_KEY_ID(鍵 ARN/ID)が必要です。",
      );
    }
    return createKmsAccount(keyId);
  }
  const key = normalizePolygonPrivateKey(privateKey);
  if (!key) {
    throw new Error(
      "[polygon-signer] POLYGON_PRIVATE_KEY が 0x+64桁hex の秘密鍵ではありません（0x プレフィックス・桁数・空白を確認してください）。",
    );
  }
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(key);
}
