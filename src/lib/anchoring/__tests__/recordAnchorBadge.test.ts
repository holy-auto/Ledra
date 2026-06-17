/**
 * 記録アンカーバッジの状態導出 (recordAnchorBadge.ts) のテスト。純関数のみ。
 */
import { describe, it, expect } from "vitest";
import { deriveRecordAnchorBadge } from "../recordAnchorBadge";
import type { CertVerifyResponse, CertVerifyAnchorDTO } from "../certVerifyResponse";

const anchorDTO = (over: Partial<CertVerifyAnchorDTO> = {}): CertVerifyAnchorDTO => ({
  cert_digest: "a".repeat(64),
  schema_version: "ledra-cert-v1",
  status: "anchored",
  anchor_route: "batch",
  canonical_json: {},
  anchored_at: "2026-06-05T18:00:00.000Z",
  created_at: "2026-06-05T09:00:00.000Z",
  merkle_root: "0x" + "b".repeat(64),
  merkle_proof: ["0xproof"],
  batch_tx_hash: "0xtx",
  batch_contract: "0xcontract",
  instant_tx_hash: null,
  block_number: 1,
  network: "amoy",
  polygonscan_url: "https://amoy.polygonscan.com/tx/0xtx",
  ...over,
});

const res = (
  current: CertVerifyAnchorDTO | null,
  over: Partial<CertVerifyResponse["record_anchoring"]> = {},
): CertVerifyResponse => ({
  public_id: "cert_x",
  status: "active",
  record_anchoring: {
    present: current !== null,
    on_chain_verified: null,
    current,
    history: current ? [current] : [],
    ...over,
  },
  image_anchors: [],
});

describe("deriveRecordAnchorBadge", () => {
  it("returns none for null / not present / no current", () => {
    expect(deriveRecordAnchorBadge(null).kind).toBe("none");
    expect(deriveRecordAnchorBadge(res(null)).kind).toBe("none");
    expect(deriveRecordAnchorBadge(res(anchorDTO(), { present: false })).kind).toBe("none");
  });

  it("returns anchored with href + verified passthrough", () => {
    const state = deriveRecordAnchorBadge(res(anchorDTO(), { on_chain_verified: true }));
    expect(state.kind).toBe("anchored");
    if (state.kind === "anchored") {
      expect(state.href).toBe("https://amoy.polygonscan.com/tx/0xtx");
      expect(state.verified).toBe(true);
      expect(state.label).toContain("検証済み");
      expect(state.tooltip).toContain("確認済み");
    }
  });

  it("anchored with on_chain_verified null omits the verified note", () => {
    const state = deriveRecordAnchorBadge(res(anchorDTO(), { on_chain_verified: null }));
    expect(state.kind).toBe("anchored");
    if (state.kind === "anchored") {
      expect(state.verified).toBeNull();
      expect(state.tooltip).not.toContain("確認済み");
    }
  });

  it("returns pending for queued / batched", () => {
    expect(deriveRecordAnchorBadge(res(anchorDTO({ status: "queued" }))).kind).toBe("pending");
    expect(deriveRecordAnchorBadge(res(anchorDTO({ status: "batched" }))).kind).toBe("pending");
  });

  it("returns none for failed / unknown status", () => {
    expect(deriveRecordAnchorBadge(res(anchorDTO({ status: "failed" }))).kind).toBe("none");
  });
});
