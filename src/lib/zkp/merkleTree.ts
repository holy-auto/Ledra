/**
 * SHA-256 Merkle ツリー実装（選択的開示 / Selective Disclosure）
 *
 * 葉 (leaf) = SHA-256(claimKey + "|" + claimValue + "|" + nonce)
 * 内部ノード = SHA-256(left_child + right_child)
 *
 * 奇数リーフの場合は最後のリーフを複製してバランスを取る
 * （標準的な Binary Merkle Tree の慣習）。
 */

import crypto from "crypto";
import type { MerklePathNode, ZkpClaim } from "./types";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** 2 つの子ノードハッシュから親ノードを計算 */
function hashPair(left: string, right: string): string {
  return sha256(left + right);
}

/** リーフ配列をパッドして偶数にする */
function padLeaves(leaves: string[]): string[] {
  if (leaves.length === 0) throw new Error("MerkleTree: leaves must not be empty");
  if (leaves.length % 2 === 0) return [...leaves];
  return [...leaves, leaves[leaves.length - 1]];
}

/**
 * Merkle ルートを計算する。
 * @param leaves - リーフハッシュ配列（順序が重要）
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 1) return leaves[0];

  let currentLevel = padLeaves(leaves);
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
    }
    currentLevel = nextLevel.length % 2 === 0 || nextLevel.length === 1 ? nextLevel : padLeaves(nextLevel);
  }
  return currentLevel[0];
}

/**
 * 指定リーフの Merkle パスを生成する。
 * @param leaves      - 全リーフハッシュ配列
 * @param targetIndex - 証明するリーフのインデックス
 */
export function computeMerklePath(leaves: string[], targetIndex: number): MerklePathNode[] {
  if (targetIndex < 0 || targetIndex >= leaves.length) {
    throw new RangeError(`MerkleTree: targetIndex ${targetIndex} out of range [0, ${leaves.length})`);
  }

  const path: MerklePathNode[] = [];
  let currentLevel = padLeaves(leaves);
  let idx = targetIndex;

  while (currentLevel.length > 1) {
    const isRightChild = idx % 2 === 1;
    const siblingIdx = isRightChild ? idx - 1 : idx + 1;
    // パッドされた配列の末尾を越えることはない（padLeaves が保証）
    path.push({ hash: currentLevel[siblingIdx], position: isRightChild ? "left" : "right" });

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
    }
    currentLevel = nextLevel.length > 1 ? padLeaves(nextLevel) : nextLevel;
    idx = Math.floor(idx / 2);
  }
  return path;
}

/**
 * Merkle 証明を検証する。
 * @param leafHash   - 証明するリーフのハッシュ
 * @param path       - computeMerklePath() の出力
 * @param merkleRoot - 期待する Merkle ルート
 */
export function verifyMerklePath(leafHash: string, path: MerklePathNode[], merkleRoot: string): boolean {
  let current = leafHash;
  for (const node of path) {
    current = node.position === "left" ? hashPair(node.hash, current) : hashPair(current, node.hash);
  }
  return current === merkleRoot;
}

/** クレームのリーフハッシュを計算（コミットメント）*/
export function computeClaimLeaf(key: string, value: string, nonce: string): string {
  return sha256(`${key}|${value}|${nonce}`);
}

/** クレームリストから Merkle ツリーを構築して葉ハッシュ配列を返す */
export function buildMerkleLeaves(claims: ZkpClaim[]): string[] {
  return claims.map((c) => c.commitment);
}
