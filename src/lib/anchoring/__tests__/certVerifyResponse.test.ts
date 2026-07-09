/**
 * cert-verify レスポンス整形 (certVerifyResponse.ts) のテスト。純関数のみ。
 */
import { describe, it, expect } from "vitest";
import { buildCertVerifyResponse, type RawAnchorRow, type RawBatchRow, type RawImageRow } from "../certVerifyResponse";

const anchorRow = (over: Partial<RawAnchorRow> = {}): RawAnchorRow => ({
  id: "anchor1",
  cert_digest: "a".repeat(64),
  schema_version: "ledra-cert-v1",
  status: "anchored",
  anchor_route: "batch",
  canonical_json: { schema: "ledra-cert-v1", public_id: "cert_x" },
  batch_id: "batch1",
  merkle_proof: ["0xproof1", "0xproof2"],
  instant_tx_hash: null,
  polygon_network: null,
  block_number: null,
  anchored_at: "2026-06-05T18:00:00.000Z",
  created_at: "2026-06-05T09:00:00.000Z",
  ...over,
});

const batchRow = (over: Partial<RawBatchRow> = {}): RawBatchRow => ({
  id: "batch1",
  merkle_root: "0x" + "b".repeat(64),
  contract_address: "0xcontract",
  network: "amoy",
  tx_hash: "0xbatchtx",
  block_number: 123,
  anchored_at: "2026-06-05T18:00:00.000Z",
  ...over,
});

const base = {
  publicId: "cert_x",
  certStatus: "active",
  batchById: new Map<string, RawBatchRow>(),
  currentAnchorId: null,
  images: [] as RawImageRow[],
  onChainVerified: null as boolean | null,
};

describe("buildCertVerifyResponse", () => {
  it("returns empty record_anchoring when there are no anchors", () => {
    const res = buildCertVerifyResponse({ ...base, anchors: [] });
    expect(res.public_id).toBe("cert_x");
    expect(res.status).toBe("active");
    expect(res.record_anchoring).toEqual({ present: false, on_chain_verified: null, current: null, history: [] });
    expect(res.image_anchors).toEqual([]);
  });

  it("maps a batch anchor with merkle root, proof, tx and explorer url", () => {
    const batchById = new Map([["batch1", batchRow()]]);
    const res = buildCertVerifyResponse({
      ...base,
      anchors: [anchorRow()],
      batchById,
      currentAnchorId: "anchor1",
      onChainVerified: true,
    });
    const c = res.record_anchoring.current;
    expect(c).not.toBeNull();
    expect(c?.merkle_root).toBe("0x" + "b".repeat(64));
    expect(c?.merkle_proof).toEqual(["0xproof1", "0xproof2"]);
    expect(c?.batch_tx_hash).toBe("0xbatchtx");
    expect(c?.batch_contract).toBe("0xcontract");
    expect(c?.network).toBe("amoy");
    expect(c?.block_number).toBe(123);
    expect(c?.polygonscan_url).toBe("https://amoy.polygonscan.com/tx/0xbatchtx");
    expect(res.record_anchoring.present).toBe(true);
    expect(res.record_anchoring.on_chain_verified).toBe(true);
  });

  it("selects current by currentAnchorId and falls back to newest", () => {
    const anchors = [
      anchorRow({ id: "new", cert_digest: "c".repeat(64) }),
      anchorRow({ id: "old", cert_digest: "d".repeat(64) }),
    ];
    const batchById = new Map([["batch1", batchRow()]]);
    const explicit = buildCertVerifyResponse({ ...base, anchors, batchById, currentAnchorId: "old" });
    expect(explicit.record_anchoring.current?.cert_digest).toBe("d".repeat(64));

    const fallback = buildCertVerifyResponse({ ...base, anchors, batchById, currentAnchorId: null });
    expect(fallback.record_anchoring.current?.cert_digest).toBe("c".repeat(64));
    expect(fallback.record_anchoring.history).toHaveLength(2);
  });

  it("handles an instant anchor (no batch): instant tx drives explorer, root null", () => {
    const anchors = [
      anchorRow({
        anchor_route: "instant",
        batch_id: null,
        instant_tx_hash: "0xinstant",
        polygon_network: "polygon",
        merkle_proof: null,
      }),
    ];
    const res = buildCertVerifyResponse({ ...base, anchors });
    const c = res.record_anchoring.current;
    expect(c?.merkle_root).toBeNull();
    expect(c?.instant_tx_hash).toBe("0xinstant");
    expect(c?.network).toBe("polygon");
    expect(c?.polygonscan_url).toBe("https://polygonscan.com/tx/0xinstant");
    expect(c?.merkle_proof).toBeNull();
  });

  it("on_chain_verified is null when there is no current anchor", () => {
    const res = buildCertVerifyResponse({ ...base, anchors: [], onChainVerified: true });
    expect(res.record_anchoring.on_chain_verified).toBeNull();
  });

  it("maps image anchors and filters rows without sha256", () => {
    const images: RawImageRow[] = [
      {
        sha256: "e".repeat(64),
        polygon_tx_hash: "0ximgtx",
        polygon_network: "amoy",
        authenticity_grade: "verified",
        created_at: "2026-06-05T08:00:00.000Z",
        tsa_authority: null,
        tsa_timestamp_at: null,
      },
      {
        sha256: null,
        polygon_tx_hash: "0xnope",
        polygon_network: "amoy",
        authenticity_grade: null,
        created_at: null,
        tsa_authority: null,
        tsa_timestamp_at: null,
      },
    ];
    const res = buildCertVerifyResponse({ ...base, anchors: [], images });
    expect(res.image_anchors).toHaveLength(1);
    expect(res.image_anchors[0]).toMatchObject({
      sha256: "e".repeat(64),
      tx_hash: "0ximgtx",
      network: "amoy",
      polygonscan_url: "https://amoy.polygonscan.com/tx/0ximgtx",
    });
  });

  it("exposes TSA authority/timestamp for a photo sealed independently of polygon anchoring", () => {
    const images: RawImageRow[] = [
      {
        sha256: "f".repeat(64),
        polygon_tx_hash: null,
        polygon_network: null,
        authenticity_grade: "verified",
        created_at: "2026-06-05T08:00:00.000Z",
        tsa_authority: "freetsa.org",
        tsa_timestamp_at: "2026-06-05T07:59:58.000Z",
      },
    ];
    const res = buildCertVerifyResponse({ ...base, anchors: [], images });
    expect(res.image_anchors).toHaveLength(1);
    expect(res.image_anchors[0]).toMatchObject({
      sha256: "f".repeat(64),
      tx_hash: null,
      network: null,
      polygonscan_url: null,
      tsa_authority: "freetsa.org",
      tsa_timestamp_at: "2026-06-05T07:59:58.000Z",
    });
  });
});
