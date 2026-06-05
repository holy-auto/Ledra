/**
 * 証明書 digest 群から Merkle tree を構築する (純関数)。
 *
 * 設計: docs/anchoring-roadmap.md
 *
 * OpenZeppelin の `StandardMerkleTree` を使う (独自実装はしない)。
 *   - leaf encoding: `["bytes32"]` / leaf = keccak256(keccak256(abi.encode(value)))
 *   - sorted pairs (OZ 既定) — オフチェーンの汎用検証器と互換
 *
 * root は LedraBatchAnchor.anchorBatch(root, leafCount) に渡し、各証明書の proof は
 * certificate_anchors.merkle_proof に保存して第三者がオフチェーン検証できるようにする。
 */

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

/** 64桁 hex (0x なし) の cert_digest 形式。 */
const DIGEST_RE = /^[0-9a-f]{64}$/;

export interface CertMerkleResult {
  /** Merkle root (0x + 64 hex)。 */
  root: `0x${string}`;
  /** ユニークな leaf 数。 */
  leafCount: number;
  /** cert_digest (小文字 64hex, 0x なし) → OZ proof (0x bytes32 の配列)。 */
  proofByDigest: Map<string, string[]>;
}

/**
 * cert_digest の配列から Merkle root と digest 別 proof を構築する。
 *
 * - digest は小文字化し、重複は 1 leaf に畳む (proof は同 digest の全行で共有)。
 * - 不正な digest / 空入力は throw (壊れた root を作らない)。
 */
export function buildCertMerkle(digests: string[]): CertMerkleResult {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const d of digests) {
    const norm = typeof d === "string" ? d.toLowerCase() : "";
    if (!DIGEST_RE.test(norm)) {
      throw new Error(`buildCertMerkle: malformed cert_digest: ${String(d)}`);
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    unique.push(norm);
  }
  if (unique.length === 0) throw new Error("buildCertMerkle: no digests to anchor");

  const tree = StandardMerkleTree.of(
    unique.map((d) => [`0x${d}`]),
    ["bytes32"],
  );

  const proofByDigest = new Map<string, string[]>();
  for (const [i, value] of tree.entries()) {
    const leaf = String(value[0]).slice(2).toLowerCase(); // strip 0x
    proofByDigest.set(leaf, tree.getProof(i));
  }

  return { root: tree.root as `0x${string}`, leafCount: unique.length, proofByDigest };
}
