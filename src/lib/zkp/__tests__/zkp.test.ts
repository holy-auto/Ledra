import { describe, it, expect } from "vitest";
import { computeMerkleRoot, computeMerklePath, verifyMerklePath, computeClaimLeaf } from "../merkleTree";

describe("Merkle tree", () => {
  it("single leaf: root equals leaf", () => {
    const leaf = computeClaimLeaf("part_category", "brake_pad_oem", "nonce1");
    expect(computeMerkleRoot([leaf])).toBe(leaf);
  });

  it("two leaves: root differs from leaves", () => {
    const l1 = computeClaimLeaf("part_category", "brake_pad_oem", "n1");
    const l2 = computeClaimLeaf("brand_tier", "oem", "n2");
    const root = computeMerkleRoot([l1, l2]);
    expect(root).not.toBe(l1);
    expect(root).not.toBe(l2);
    expect(root).toHaveLength(64);
  });

  it("verifyMerklePath returns true for valid proof", () => {
    const leaves = ["a", "b", "c", "d"].map((v, i) => computeClaimLeaf("part_category", v, `n${i}`));
    const root = computeMerkleRoot(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const path = computeMerklePath(leaves, i);
      expect(verifyMerklePath(leaves[i], path, root)).toBe(true);
    }
  });

  it("verifyMerklePath returns false for tampered leaf", () => {
    const leaves = ["a", "b", "c"].map((v, i) => computeClaimLeaf("k", v, `n${i}`));
    const root = computeMerkleRoot(leaves);
    const path = computeMerklePath(leaves, 0);
    const tampered = computeClaimLeaf("k", "evil", "nx");
    expect(verifyMerklePath(tampered, path, root)).toBe(false);
  });

  it("odd number of leaves is handled correctly", () => {
    const leaves = ["a", "b", "c"].map((v, i) => computeClaimLeaf("k", v, `n${i}`));
    const root = computeMerkleRoot(leaves);
    expect(root).toHaveLength(64);
    for (let i = 0; i < leaves.length; i++) {
      const path = computeMerklePath(leaves, i);
      expect(verifyMerklePath(leaves[i], path, root)).toBe(true);
    }
  });

  it("deterministic: same inputs produce same root", () => {
    const leaves = ["x", "y"].map((v) => computeClaimLeaf("k", v, "n"));
    expect(computeMerkleRoot(leaves)).toBe(computeMerkleRoot(leaves));
  });
});
