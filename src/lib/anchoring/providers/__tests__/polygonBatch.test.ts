/**
 * polygonBatch provider のテスト。providers.test.ts と同じく無効化 / 設定不足の
 * no-op 経路を検証する (実チェーン書き込みはユニットテストの対象外)。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ROOT = "0x" + "a".repeat(64);

describe("anchorBatchToPolygon", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.POLYGON_ANCHOR_ENABLED;
    delete process.env.POLYGON_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_PRIVATE_KEY;
    delete process.env.POLYGON_BATCH_CONTRACT_ADDRESS;
  });

  it("returns disabled result when POLYGON_ANCHOR_ENABLED is not set", async () => {
    const { anchorBatchToPolygon } = await import("../polygonBatch");
    expect(await anchorBatchToPolygon(ROOT, 3)).toEqual({
      txHash: null,
      anchored: false,
      network: null,
      contractAddress: null,
      blockNumber: null,
    });
  });

  it("returns disabled result when enabled but missing config", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { anchorBatchToPolygon } = await import("../polygonBatch");
    const result = await anchorBatchToPolygon(ROOT, 3);
    expect(result.anchored).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[polygon-batch] enabled but missing config"));
    warnSpy.mockRestore();
  });

  it("rejects a malformed merkle root even when fully configured", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    process.env.POLYGON_PRIVATE_KEY = "0x" + "1".repeat(64);
    process.env.POLYGON_BATCH_CONTRACT_ADDRESS = "0x" + "0".repeat(39) + "1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { anchorBatchToPolygon } = await import("../polygonBatch");
    const result = await anchorBatchToPolygon("0xtooshort", 3);
    expect(result.anchored).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("malformed merkle root"));
    warnSpy.mockRestore();
  });
});

describe("verifyBatchAnchor", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.POLYGON_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_BATCH_CONTRACT_ADDRESS;
  });

  it("returns false when batch contract config is missing", async () => {
    const { verifyBatchAnchor } = await import("../polygonBatch");
    expect(await verifyBatchAnchor(ROOT)).toBe(false);
  });

  it("returns false for a malformed root even when a contract is configured", async () => {
    process.env.POLYGON_BATCH_CONTRACT_ADDRESS = "0x" + "0".repeat(39) + "1";
    vi.resetModules();
    const { verifyBatchAnchor } = await import("../polygonBatch");
    expect(await verifyBatchAnchor("0xtooshort")).toBe(false);
  });
});
