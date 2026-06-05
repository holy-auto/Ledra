/**
 * runCertificateAnchorBatch (cron 本体) のテスト。
 *
 * - 空 queue → no-op
 * - アンカー無効/失敗 → 行は queued 据え置き・batch 行なし
 * - アンカー成功 → batch 行 insert・anchor 行を anchored 化 (proof/batch_id 付与)・
 *   certificates.latest_anchor_id 更新
 *
 * createServiceRoleAdmin は in-memory store、anchorBatchToPolygon は vi.fn に差し替える。
 * Merkle 構築は本物 (純関数) を使う。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CERT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const CERT_B = "bbbbbbbb-2222-4222-8222-222222222222";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

const h = vi.hoisted(() => {
  const state: {
    store: Record<string, Record<string, unknown>[]>;
    seq: number;
    anchorBatch: ReturnType<typeof vi.fn>;
    makeAdmin: () => { from: (t: string) => unknown };
  } = {
    store: {},
    seq: 0,
    anchorBatch: vi.fn(),
    makeAdmin: () => ({ from: () => ({}) }),
  };
  function makeAdmin() {
    const store = state.store;
    function from(table: string) {
      if (!store[table]) store[table] = [];
      const rows = store[table];
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> | null = null;
      let inserted: Record<string, unknown>[] = [];
      function run(single: boolean) {
        if (op === "insert") return { data: single ? (inserted[0] ?? null) : inserted, error: null };
        if (op === "update") {
          for (const r of rows.filter((r) => filters.every((f) => f(r)))) Object.assign(r, payload);
          return { data: null, error: null };
        }
        const out = rows.filter((r) => filters.every((f) => f(r)));
        return { data: single ? (out[0] ?? null) : out, error: null };
      }
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        insert: (p: Record<string, unknown> | Record<string, unknown>[]) => {
          op = "insert";
          inserted = (Array.isArray(p) ? p : [p]).map((x) => ({ id: x.id ?? `gen_${++state.seq}`, ...x }));
          rows.push(...inserted);
          return b;
        },
        update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
        single: () => Promise.resolve(run(true)),
        maybeSingle: () => Promise.resolve(run(true)),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(run(false)).then(res, rej),
      };
      return b;
    }
    return { from };
  }
  state.makeAdmin = makeAdmin;
  return state;
});

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => h.makeAdmin() }));
vi.mock("@/lib/anchoring/providers/polygonBatch", () => ({
  anchorBatchToPolygon: (root: string, leafCount: number) =>
    (h.anchorBatch as unknown as (r: string, l: number) => unknown)(root, leafCount),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, info: () => {}, error: () => {}, child: () => ({}) } }));

import { runCertificateAnchorBatch } from "../certificateBatchAnchor";

function seedQueued() {
  h.store.certificate_anchors = [
    {
      id: "anchor_a",
      tenant_id: TENANT,
      certificate_id: CERT_A,
      cert_digest: DIGEST_A,
      status: "queued",
      anchor_route: "batch",
      created_at: "2026-06-05T00:00:00.000Z",
    },
    {
      id: "anchor_b",
      tenant_id: TENANT,
      certificate_id: CERT_B,
      cert_digest: DIGEST_B,
      status: "queued",
      anchor_route: "batch",
      created_at: "2026-06-05T00:01:00.000Z",
    },
  ];
  h.store.certificate_anchor_batches = [];
  h.store.certificates = [
    { id: CERT_A, tenant_id: TENANT, latest_anchor_id: null },
    { id: CERT_B, tenant_id: TENANT, latest_anchor_id: null },
  ];
}

beforeEach(() => {
  h.store = { certificate_anchors: [], certificate_anchor_batches: [], certificates: [] };
  h.seq = 0;
  h.anchorBatch.mockReset();
});

describe("runCertificateAnchorBatch", () => {
  it("no-ops on an empty queue", async () => {
    const res = await runCertificateAnchorBatch();
    expect(res).toEqual({ scanned: 0, anchored: 0, batched: false, reason: "empty" });
    expect(h.anchorBatch).not.toHaveBeenCalled();
  });

  it("leaves rows queued when anchoring is disabled/failed", async () => {
    seedQueued();
    h.anchorBatch.mockResolvedValue({
      txHash: null,
      anchored: false,
      network: null,
      contractAddress: null,
      blockNumber: null,
    });

    const res = await runCertificateAnchorBatch();

    expect(res.batched).toBe(false);
    expect(res.reason).toBe("anchor_skipped_or_failed");
    expect(res.scanned).toBe(2);
    expect(h.store.certificate_anchor_batches).toHaveLength(0);
    // 行は queued のまま据え置き
    expect(h.store.certificate_anchors.every((r) => r.status === "queued")).toBe(true);
  });

  it("anchors: inserts batch, marks rows anchored with proofs, sets latest_anchor_id", async () => {
    seedQueued();
    h.anchorBatch.mockResolvedValue({
      txHash: "0xtx",
      anchored: true,
      network: "amoy",
      contractAddress: "0xcontract",
      blockNumber: 123,
    });

    const res = await runCertificateAnchorBatch();

    // anchorBatchToPolygon は root(0x64hex) + leafCount=2 で呼ばれる
    expect(h.anchorBatch).toHaveBeenCalledTimes(1);
    const [root, leafCount] = h.anchorBatch.mock.calls[0];
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(leafCount).toBe(2);

    expect(res).toMatchObject({ scanned: 2, anchored: 2, batched: true, txHash: "0xtx" });

    // batch 行
    expect(h.store.certificate_anchor_batches).toHaveLength(1);
    expect(h.store.certificate_anchor_batches[0]).toMatchObject({
      merkle_root: root,
      leaf_count: 2,
      contract_address: "0xcontract",
      network: "amoy",
      tx_hash: "0xtx",
      block_number: 123,
    });
    const batchId = h.store.certificate_anchor_batches[0].id;

    // anchor 行
    for (const r of h.store.certificate_anchors) {
      expect(r.status).toBe("anchored");
      expect(r.batch_id).toBe(batchId);
      expect(r.polygon_network).toBe("amoy");
      expect(Array.isArray(r.merkle_proof)).toBe(true);
    }

    // certificates.latest_anchor_id
    const certA = h.store.certificates.find((c) => c.id === CERT_A);
    const certB = h.store.certificates.find((c) => c.id === CERT_B);
    expect(certA?.latest_anchor_id).toBe("anchor_a");
    expect(certB?.latest_anchor_id).toBe("anchor_b");
  });
});
