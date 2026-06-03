import { describe, it, expect, beforeAll } from "vitest";
import {
  buildPartManifest,
  computePartContentHash,
  serialFingerprint,
  deriveRequiredAssurance,
  PART_MANIFEST_SCHEMA_VERSION,
  type PartManifestInput,
} from "@/lib/parts/contentHash";

const base: PartManifestInput = {
  tenantId: "t1",
  installationId: "i1",
  vehicleId: "v1",
  jobOrderId: null,
  customerId: "c1",
  customerPhoneFullHash: "phash",
  partName: "ブレーキパッド",
  gtin: "4901234567894",
  lotCode: "L-2026-06",
  serialFingerprint: null,
  partKind: "lot_only",
  quantity: 2,
  unit: "個",
  amountJpy: 12000,
  evidenceSha256: ["bbb", "aaa", "ccc"],
  installedAt: "2026-06-03T01:00:00.000Z",
  nonce: "nonce-xyz",
};

describe("buildPartManifest / computePartContentHash", () => {
  it("schema 版を埋め込む", () => {
    expect(buildPartManifest(base).schema).toBe(PART_MANIFEST_SCHEMA_VERSION);
  });

  it("evidence の順序が変わっても content_hash は同一（順序非依存）", () => {
    const h1 = computePartContentHash(base);
    const h2 = computePartContentHash({ ...base, evidenceSha256: ["ccc", "aaa", "bbb"] });
    expect(h1).toBe(h2);
  });

  it("evidence の重複は排除される", () => {
    const h1 = computePartContentHash(base);
    const h2 = computePartContentHash({ ...base, evidenceSha256: ["aaa", "bbb", "ccc", "ccc"] });
    expect(h1).toBe(h2);
  });

  it("数量を変えると content_hash が変わる（改ざん検知）", () => {
    const h1 = computePartContentHash(base);
    const h2 = computePartContentHash({ ...base, quantity: 3 });
    expect(h1).not.toBe(h2);
  });

  it("写真(evidence)を差し替えると content_hash が変わる", () => {
    const h1 = computePartContentHash(base);
    const h2 = computePartContentHash({ ...base, evidenceSha256: ["aaa", "bbb", "zzz"] });
    expect(h1).not.toBe(h2);
  });

  it("hex 64 文字の SHA-256 を返す", () => {
    expect(computePartContentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("非有限の quantity は拒否", () => {
    expect(() => buildPartManifest({ ...base, quantity: Infinity })).toThrow();
  });
});

describe("serialFingerprint", () => {
  beforeAll(() => {
    process.env.PARTS_SERIAL_PEPPER = "test-pepper";
  });

  it("同一 gtin+serial は決定的に同一", () => {
    expect(serialFingerprint("4901234567894", "SN-001")).toBe(serialFingerprint("4901234567894", "SN-001"));
  });

  it("大文字小文字/前後空白を正規化する", () => {
    expect(serialFingerprint("4901234567894", "  sn-001 ")).toBe(serialFingerprint("4901234567894", "SN-001"));
  });

  it("serial が違えば別フィンガープリント", () => {
    expect(serialFingerprint("4901234567894", "SN-001")).not.toBe(serialFingerprint("4901234567894", "SN-002"));
  });

  it("空 serial は拒否", () => {
    expect(() => serialFingerprint("g", "   ")).toThrow();
  });
});

describe("deriveRequiredAssurance", () => {
  it("serialized は常に customer_otp", () => {
    expect(deriveRequiredAssurance("serialized", 0)).toBe("customer_otp");
  });
  it("high_value は customer_otp", () => {
    expect(deriveRequiredAssurance("high_value", null)).toBe("customer_otp");
  });
  it("税込10万円超は customer_otp", () => {
    expect(deriveRequiredAssurance("consumable", 100_001)).toBe("customer_otp");
  });
  it("ちょうど10万円は超えていない → any（consumable）", () => {
    expect(deriveRequiredAssurance("consumable", 100_000)).toBe("any");
  });
  it("lot_only は store_contact_otp", () => {
    expect(deriveRequiredAssurance("lot_only", 5000)).toBe("store_contact_otp");
  });
  it("consumable 低額は any", () => {
    expect(deriveRequiredAssurance("consumable", 500)).toBe("any");
  });
});
