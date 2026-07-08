/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeClaimLeaf, computeMerkleRoot } from "../merkleTree";
import type { ZkpClaim } from "../types";

const h = vi.hoisted(() => ({
  row: null as any,
  verifyAnchor: vi.fn(),
}));

// DB 行は h.row をそのまま返す (self-referential 行を模擬できる)。
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }),
      }),
    }),
  }),
}));

vi.mock("@/lib/anchoring/providers/polygon", () => ({
  verifyAnchor: (...args: unknown[]) => h.verifyAnchor(...args),
}));

import { verifyZkpClaims } from "../verifier";

function makeRow() {
  const claims: ZkpClaim[] = [
    {
      key: "part_category",
      value: "brake_pad_oem",
      commitment: computeClaimLeaf("part_category", "brake_pad_oem", "n1"),
    },
    { key: "brand_tier", value: null, commitment: computeClaimLeaf("brand_tier", "oem", "n2") },
  ];
  return {
    id: "c1",
    installation_id: "i1",
    merkle_root: computeMerkleRoot(claims.map((c) => c.commitment)),
    leaf_count: claims.length,
    claims_snapshot: claims,
    polygon_tx_hash: "0x" + "a".repeat(64),
    polygon_network: "amoy",
    polygon_anchored_at: "2026-06-01T00:00:00Z",
  };
}

beforeEach(() => {
  h.row = makeRow();
  h.verifyAnchor.mockReset();
});

describe("verifyZkpClaims — オンチェーン照合", () => {
  it("Merkle 有効 + オンチェーンにルートが実在 → overallValid true (行の network で照合)", async () => {
    h.verifyAnchor.mockResolvedValue(true);
    const r = await verifyZkpClaims({ commitmentId: "c1", claimsToVerify: ["part_category"], insurerId: "ins1" });
    expect(r.overallValid).toBe(true);
    expect(r.verifiedClaims.part_category.verified).toBe(true);
    expect(h.verifyAnchor).toHaveBeenCalledWith(h.row.merkle_root, "amoy");
  });

  it("polygon_tx_hash が非 null でも、オンチェーンに無ければ overallValid false (DB 行改ざん対策)", async () => {
    // 改ざんシナリオ: 行の tx hash / merkle_root を書き換えても、チェーン上に
    // そのルートが無い限り検証は通らない。RPC 不達 (verifyAnchor=false) も同じ fail-closed。
    h.verifyAnchor.mockResolvedValue(false);
    const r = await verifyZkpClaims({ commitmentId: "c1", claimsToVerify: ["part_category"], insurerId: "ins1" });
    expect(r.overallValid).toBe(false);
    // Merkle 数学自体は通る (クレーム単位の verified は true のまま)。
    expect(r.verifiedClaims.part_category.verified).toBe(true);
  });
});
