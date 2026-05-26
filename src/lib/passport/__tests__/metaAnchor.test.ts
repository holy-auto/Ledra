import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const mocks = vi.hoisted(() => ({
  anchorToPolygon: vi.fn(),
}));

vi.mock("@/lib/anchoring/providers", () => ({ anchorToPolygon: mocks.anchorToPolygon }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { computeMetaAnchorHash, recomputeAndMaybeAnchor } from "../metaAnchor";

describe("computeMetaAnchorHash", () => {
  it("is order-independent across the tx hash list", () => {
    const a = computeMetaAnchorHash({
      vinNormalized: "JH4DC53001S000001",
      txHashes: ["0xaa", "0xbb", "0xcc"],
    });
    const b = computeMetaAnchorHash({
      vinNormalized: "JH4DC53001S000001",
      txHashes: ["0xcc", "0xaa", "0xbb"],
    });
    expect(a.metaHash).toBe(b.metaHash);
  });

  it("dedupes duplicate tx hashes and lowercases", () => {
    const r = computeMetaAnchorHash({
      vinNormalized: "vin",
      txHashes: ["0xAB", "0xab", "0xAB"],
    });
    expect(r.contributingTxHashes).toEqual(["0xab"]);
  });

  it("normalizes VIN case", () => {
    const upper = computeMetaAnchorHash({ vinNormalized: "Abc123", txHashes: ["0xa"] });
    const lower = computeMetaAnchorHash({ vinNormalized: "abc123", txHashes: ["0xa"] });
    expect(upper.metaHash).toBe(lower.metaHash);
  });

  it("changes when a new tx hash is added", () => {
    const before = computeMetaAnchorHash({ vinNormalized: "v", txHashes: ["0xa"] });
    const after = computeMetaAnchorHash({ vinNormalized: "v", txHashes: ["0xa", "0xb"] });
    expect(before.metaHash).not.toBe(after.metaHash);
  });

  it("matches an externally-recomputable sha256 over VIN + sorted txs", () => {
    const vin = "JH4DC53001S000001";
    const txs = ["0xbb", "0xaa", "0xcc"];
    const expected = crypto.createHash("sha256").update([vin, "0xaa", "0xbb", "0xcc"].join("\n"), "utf8").digest("hex");
    expect(computeMetaAnchorHash({ vinNormalized: vin, txHashes: txs }).metaHash).toBe(expected);
  });

  it("throws on empty VIN", () => {
    expect(() => computeMetaAnchorHash({ vinNormalized: "   ", txHashes: ["0xa"] })).toThrow();
  });
});

// --- recomputeAndMaybeAnchor ------------------------------------------------

type FakeRow = Record<string, unknown>;

/**
 * Tiny supabase-shaped stub that returns canned rows per table and captures
 * .update() payloads keyed by VIN (the .eq used in the production code).
 */
function fakeAdmin({
  vehicles,
  certificates,
  images,
  passport,
  onUpdate,
}: {
  vehicles: FakeRow[];
  certificates: FakeRow[];
  images: FakeRow[];
  passport: FakeRow | null;
  onUpdate?: (doc: FakeRow) => void;
}) {
  return {
    from: (table: string) => {
      if (table === "vehicles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: vehicles }),
            }),
          }),
        };
      }
      if (table === "certificates") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: certificates }),
          }),
        };
      }
      if (table === "certificate_images") {
        return {
          select: () => ({
            in: () => ({
              not: () => Promise.resolve({ data: images }),
            }),
          }),
        };
      }
      if (table === "vehicle_passports") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: passport }) }),
          }),
          update: (doc: FakeRow) => {
            onUpdate?.(doc);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  mocks.anchorToPolygon.mockReset();
});

describe("recomputeAndMaybeAnchor", () => {
  it("noop when no anchored images exist", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = fakeAdmin({
      vehicles: [{ id: "v1" }],
      certificates: [{ id: "c1" }],
      images: [],
      passport: null,
    }) as any;
    const res = await recomputeAndMaybeAnchor(admin, "vin1");
    expect(res.status).toBe("noop");
    expect(mocks.anchorToPolygon).not.toHaveBeenCalled();
  });

  it("noop when stored hash matches recomputed hash (no extra Polygon tx)", async () => {
    const { metaHash } = computeMetaAnchorHash({ vinNormalized: "VIN1", txHashes: ["0xaa", "0xbb"] });
    let updated: FakeRow | null = null;
    const admin = fakeAdmin({
      vehicles: [{ id: "v1" }],
      certificates: [{ id: "c1" }, { id: "c2" }],
      images: [
        { certificate_id: "c1", polygon_tx_hash: "0xaa" },
        { certificate_id: "c2", polygon_tx_hash: "0xbb" },
      ],
      passport: { meta_anchor_hash: metaHash },
      onUpdate: (doc) => (updated = doc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const res = await recomputeAndMaybeAnchor(admin, "VIN1");
    expect(res.status).toBe("noop");
    expect(mocks.anchorToPolygon).not.toHaveBeenCalled();
    expect(updated).toBeNull();
  });

  it("anchors and persists when the recomputed hash differs", async () => {
    mocks.anchorToPolygon.mockResolvedValueOnce({
      anchored: true,
      txHash: "0xdeadbeef",
      network: "amoy",
    });

    let updated: FakeRow | null = null;
    const admin = fakeAdmin({
      vehicles: [{ id: "v1" }],
      certificates: [{ id: "c1" }, { id: "c2" }],
      images: [
        { certificate_id: "c1", polygon_tx_hash: "0xaa" },
        { certificate_id: "c2", polygon_tx_hash: "0xbb" },
      ],
      passport: { meta_anchor_hash: "stale" },
      onUpdate: (doc) => (updated = doc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const res = await recomputeAndMaybeAnchor(admin, "VIN1");
    expect(res.status).toBe("anchored");
    if (res.status !== "anchored") throw new Error("unreachable");
    expect(res.txHash).toBe("0xdeadbeef");
    expect(res.network).toBe("amoy");
    expect(res.imageCount).toBe(2);
    expect(res.certCount).toBe(2);
    expect(mocks.anchorToPolygon).toHaveBeenCalledExactlyOnceWith(res.metaHash);
    expect(updated).toMatchObject({
      meta_anchor_hash: res.metaHash,
      meta_anchor_tx_hash: "0xdeadbeef",
      meta_anchor_network: "amoy",
      meta_anchor_image_count: 2,
      meta_anchor_cert_count: 2,
    });
  });

  it("records hash + counts when Polygon anchoring fails (status anchor_failed)", async () => {
    mocks.anchorToPolygon.mockResolvedValueOnce({ anchored: false, txHash: null, network: null });

    let updated: FakeRow | null = null;
    const admin = fakeAdmin({
      vehicles: [{ id: "v1" }],
      certificates: [{ id: "c1" }],
      images: [{ certificate_id: "c1", polygon_tx_hash: "0xaa" }],
      passport: { meta_anchor_hash: null },
      onUpdate: (doc) => (updated = doc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const res = await recomputeAndMaybeAnchor(admin, "VIN1");
    expect(res.status).toBe("anchor_failed");
    expect(updated).toMatchObject({
      meta_anchor_hash: expect.any(String),
      meta_anchor_image_count: 1,
      meta_anchor_cert_count: 1,
    });
    expect((updated as unknown as FakeRow).meta_anchor_tx_hash).toBeUndefined();
  });
});
