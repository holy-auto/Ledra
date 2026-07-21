/**
 * Polygon KMS 署名器の要となる純関数の自己検証(AWS 不要)。
 *
 * KMS の実 E2E はこの環境では不能なので、KMS が返すのと同じ「DER ECDSA 署名 + SPKI 公開鍵」を
 * ローカルの secp256k1 鍵で作り、recoverEthSignature/spkiToAddress が
 *   - low-S(EIP-2)を強制し
 *   - 復元ビット v を鍵アドレスとの一致で正しく決定し
 *   - viem の recoverAddress で往復一致する
 * ことを検証する。high-S 入力(KMS は high-S を返しうる)の正規化も確認する。
 */
import { describe, it, expect } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, recoverAddress, serializeSignature, toHex, type Hex } from "viem";
import { recoverEthSignature, spkiToAddress } from "@/lib/anchoring/polygonSigner";

const N = secp256k1.CURVE.n;
// anvil の既知テスト鍵(#0)
const PRIV = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(`0x${PRIV}`);
const digest = keccak256(toHex("ledra polygon kms self-check")) as Hex;

/** secp256k1 の非圧縮公開鍵(04||X||Y)を標準 SPKI(DER)で包む。 */
function wrapSpki(uncompressed: Uint8Array): Uint8Array {
  // secp256k1 用 SPKI プレフィックス(23byte)+ 04||X||Y(65byte)
  const prefix = Uint8Array.from([
    0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00,
    0x0a, 0x03, 0x42, 0x00,
  ]);
  const out = new Uint8Array(prefix.length + uncompressed.length);
  out.set(prefix);
  out.set(uncompressed, prefix.length);
  return out;
}

describe("polygonSigner crypto (KMS 互換の純関数)", () => {
  it("DER 署名から {r,s(low-S),yParity} を復元し viem recoverAddress と往復一致する", async () => {
    const sig = secp256k1.sign(digest.slice(2), PRIV);
    const der = sig.toDERRawBytes(); // KMS Sign が返すのと同じ DER
    const eth = recoverEthSignature(der, digest, account.address);

    // low-S(EIP-2)が効いている
    expect(BigInt(eth.s) <= N / BigInt(2)).toBe(true);
    // viem で復元したアドレスが鍵アドレスと一致する
    const recovered = await recoverAddress({ hash: digest, signature: serializeSignature(eth) });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("high-S の DER 入力でも low-S に正規化し正しく復元する", async () => {
    const low = secp256k1.sign(digest.slice(2), PRIV);
    // s を N-s に反転して high-S の署名を作る(KMS は non-canonical を返しうる)
    const highS = new secp256k1.Signature(low.r, N - low.s);
    expect(highS.s > N / BigInt(2)).toBe(true);

    const eth = recoverEthSignature(highS.toDERRawBytes(), digest, account.address);
    expect(BigInt(eth.s) <= N / BigInt(2)).toBe(true);
    const recovered = await recoverAddress({ hash: digest, signature: serializeSignature(eth) });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("別鍵で作った署名を渡すと v を決定できず throw する", () => {
    const other = secp256k1.sign(digest.slice(2), "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    expect(() => recoverEthSignature(other.toDERRawBytes(), digest, account.address)).toThrow();
  });

  it("SPKI(DER)公開鍵から privateKeyToAccount と同一のアドレスを導出する", () => {
    const uncompressed = secp256k1.getPublicKey(PRIV, false); // 65byte 04||X||Y
    const addr = spkiToAddress(wrapSpki(uncompressed));
    expect(addr.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("非圧縮点でない SPKI は明示的に throw する", () => {
    expect(() => spkiToAddress(new Uint8Array(10))).toThrow();
  });
});
