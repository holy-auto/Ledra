import { describe, it, expect } from "vitest";
import { computePartsMetaHash } from "@/lib/parts/metaAnchor";

describe("computePartsMetaHash", () => {
  it("hex 64 文字の sha256 を返す", () => {
    expect(computePartsMetaHash("veh-1", ["aa", "bb"]).metaHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ハッシュ順序に依存しない（ソート）", () => {
    const a = computePartsMetaHash("veh-1", ["aa", "bb", "cc"]).metaHash;
    const b = computePartsMetaHash("veh-1", ["cc", "aa", "bb"]).metaHash;
    expect(a).toBe(b);
  });

  it("重複を排除する", () => {
    const a = computePartsMetaHash("veh-1", ["aa", "bb"]).metaHash;
    const b = computePartsMetaHash("veh-1", ["aa", "bb", "bb", "aa"]).metaHash;
    expect(a).toBe(b);
    expect(computePartsMetaHash("veh-1", ["aa", "bb", "bb"]).contributing).toEqual(["aa", "bb"]);
  });

  it("大文字小文字を正規化", () => {
    expect(computePartsMetaHash("veh-1", ["AA"]).metaHash).toBe(computePartsMetaHash("VEH-1", ["aa"]).metaHash);
  });

  it("内容が変わると meta_hash が変わる", () => {
    const a = computePartsMetaHash("veh-1", ["aa", "bb"]).metaHash;
    const b = computePartsMetaHash("veh-1", ["aa", "bb", "cc"]).metaHash;
    expect(a).not.toBe(b);
  });

  it("車両が違えば別ハッシュ", () => {
    expect(computePartsMetaHash("veh-1", ["aa"]).metaHash).not.toBe(computePartsMetaHash("veh-2", ["aa"]).metaHash);
  });

  it("空 vehicleId は拒否", () => {
    expect(() => computePartsMetaHash("  ", ["aa"])).toThrow();
  });

  it("空ハッシュは除外（contributing が空でも meta_hash は定義される）", () => {
    const r = computePartsMetaHash("veh-1", ["", "  "]);
    expect(r.contributing).toEqual([]);
    expect(r.metaHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
