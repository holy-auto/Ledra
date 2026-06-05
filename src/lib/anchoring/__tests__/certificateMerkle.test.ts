/**
 * Merkle 構築 (certificateMerkle.ts) のテスト。
 * OZ StandardMerkleTree.verify で proof が root に対して検証可能なことまで確認する。
 */
import { describe, it, expect } from "vitest";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { buildCertMerkle } from "../certificateMerkle";

/** 1 文字を 64 回繰り返して 64hex の擬似 digest を作る。 */
const D = (c: string) => c.repeat(64);

describe("buildCertMerkle", () => {
  it("builds a root + per-digest proof that verifies via OZ", () => {
    const digests = [D("a"), D("b"), D("c")];
    const { root, leafCount, proofByDigest } = buildCertMerkle(digests);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(leafCount).toBe(3);
    for (const d of digests) {
      const proof = proofByDigest.get(d);
      expect(proof).toBeDefined();
      expect(StandardMerkleTree.verify(root, ["bytes32"], [`0x${d}`], proof as string[])).toBe(true);
    }
  });

  it("is deterministic and order-independent", () => {
    const a = buildCertMerkle([D("a"), D("b"), D("c")]).root;
    const b = buildCertMerkle([D("c"), D("a"), D("b")]).root;
    expect(a).toBe(b);
  });

  it("dedupes duplicate digests (leafCount = unique count)", () => {
    const { leafCount, proofByDigest } = buildCertMerkle([D("a"), D("a"), D("b")]);
    expect(leafCount).toBe(2);
    expect(proofByDigest.size).toBe(2);
  });

  it("handles a single digest (root verifies, proof empty)", () => {
    const { root, leafCount, proofByDigest } = buildCertMerkle([D("a")]);
    expect(leafCount).toBe(1);
    const proof = proofByDigest.get(D("a"));
    expect(proof).toEqual([]);
    expect(StandardMerkleTree.verify(root, ["bytes32"], [`0x${D("a")}`], proof as string[])).toBe(true);
  });

  it("lowercases digests (case-insensitive root)", () => {
    expect(buildCertMerkle([D("A")]).root).toBe(buildCertMerkle([D("a")]).root);
  });

  it("produces distinct roots for distinct sets", () => {
    expect(buildCertMerkle([D("a"), D("b")]).root).not.toBe(buildCertMerkle([D("a"), D("c")]).root);
  });

  it("throws on malformed digest", () => {
    expect(() => buildCertMerkle(["short"])).toThrow(/malformed/);
    expect(() => buildCertMerkle([D("g")])).toThrow(/malformed/); // 'g' is not hex
  });

  it("throws on empty input", () => {
    expect(() => buildCertMerkle([])).toThrow(/no digests/);
  });
});
