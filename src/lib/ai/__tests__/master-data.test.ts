import { describe, it, expect } from "vitest";
import {
  normalizeMaker,
  normalizeModel,
  normalizeAddress,
  normalizePostalCode,
  normalizeCustomerName,
} from "../textNormalize";
import { diceSimilarity, fuzzyMatchCustomer } from "../customerFuzzyMatch";
import { analyzeThicknessStats, classifyThicknessSeverity } from "../thicknessAnomaly";

describe("normalizeMaker", () => {
  it("collapses TOYOTA / トヨタ / Toyota to トヨタ", () => {
    expect(normalizeMaker("TOYOTA")).toBe("トヨタ");
    expect(normalizeMaker("toyota")).toBe("トヨタ");
    expect(normalizeMaker("トヨタ")).toBe("トヨタ");
    expect(normalizeMaker("豊田")).toBe("トヨタ");
  });

  it("normalizes Mercedes / Benz variants", () => {
    expect(normalizeMaker("Mercedes-Benz")).toBe("メルセデス・ベンツ");
    expect(normalizeMaker("BENZ")).toBe("メルセデス・ベンツ");
    expect(normalizeMaker("ベンツ")).toBe("メルセデス・ベンツ");
  });

  it("returns trimmed input for unknown makers", () => {
    expect(normalizeMaker("  KIA  ")).toBe("KIA");
  });

  it("returns null for blank input", () => {
    expect(normalizeMaker(null)).toBeNull();
    expect(normalizeMaker("")).toBeNull();
    expect(normalizeMaker("   ")).toBeNull();
  });
});

describe("normalizeModel", () => {
  it("uppercases ASCII-only models", () => {
    expect(normalizeModel("prius")).toBe("PRIUS");
    expect(normalizeModel("Crown")).toBe("CROWN");
  });

  it("leaves Japanese models untouched", () => {
    expect(normalizeModel("プリウス")).toBe("プリウス");
  });
});

describe("normalizeAddress", () => {
  it("converts fullwidth digits", () => {
    expect(normalizeAddress("東京都渋谷区道玄坂１２３番").full).toContain("123");
  });

  it("extracts the prefecture when present", () => {
    expect(normalizeAddress("東京都渋谷区道玄坂1-2-3").prefecture).toBe("東京都");
    expect(normalizeAddress("大阪府大阪市北区梅田1-1-1").prefecture).toBe("大阪府");
  });

  it("returns null prefecture when missing", () => {
    expect(normalizeAddress("名古屋市中区錦").prefecture).toBeNull();
  });
});

describe("normalizePostalCode", () => {
  it("adds a hyphen to 7-digit codes", () => {
    expect(normalizePostalCode("1500043")).toBe("150-0043");
    expect(normalizePostalCode("150-0043")).toBe("150-0043");
    expect(normalizePostalCode("１５００043")).toBe("150-0043");
  });

  it("rejects non-7-digit input", () => {
    expect(normalizePostalCode("123")).toBeNull();
    expect(normalizePostalCode("abc")).toBeNull();
    expect(normalizePostalCode(null)).toBeNull();
  });
});

describe("normalizeCustomerName", () => {
  it("collapses fullwidth and double spaces", () => {
    expect(normalizeCustomerName("山田　 　太郎")).toBe("山田 太郎");
    expect(normalizeCustomerName("  山田  太郎  ")).toBe("山田 太郎");
  });
});

describe("diceSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(diceSimilarity("山田太郎", "山田太郎")).toBe(1);
  });

  it("returns >0.5 for one-character variants", () => {
    expect(diceSimilarity("山田太郎", "山田太郞")).toBeGreaterThan(0.5);
  });

  it("returns 0 for empty input", () => {
    expect(diceSimilarity("", "山田")).toBe(0);
  });
});

describe("fuzzyMatchCustomer", () => {
  const candidates = [
    { id: "c1", name: "山田 太郎", phone: "090-1111-2222", email: null },
    { id: "c2", name: "山田 花子", phone: null, email: null },
    { id: "c3", name: "佐藤 健", phone: null, email: "ken@example.com" },
  ];

  it("matches by phone with confidence 1.0", async () => {
    const out = await fuzzyMatchCustomer({
      query: { name: "ヤマダ", phone: "09011112222" },
      candidates,
    });
    expect(out.best?.candidate.id).toBe("c1");
    expect(out.confidence).toBe(1);
    expect(out.method).toBe("phone_email");
  });

  it("matches by email regardless of name", async () => {
    const out = await fuzzyMatchCustomer({
      query: { name: "違う名前", email: "ken@example.com" },
      candidates,
    });
    expect(out.best?.candidate.id).toBe("c3");
    expect(out.method).toBe("phone_email");
  });

  it("returns method=none when no candidate is similar", async () => {
    const out = await fuzzyMatchCustomer({
      query: { name: "全く別の人" },
      candidates,
    });
    expect(out.method).toBe("none");
    expect(out.best).toBeUndefined();
  });
});

describe("thickness analysis", () => {
  it("computes mean / stddev / range", () => {
    const stats = analyzeThicknessStats({
      measurements: [{ value: 100 }, { value: 110 }, { value: 105 }, { value: 95 }],
    });
    expect(stats.count).toBe(4);
    expect(stats.mean).toBeCloseTo(102.5, 1);
    expect(stats.min).toBe(95);
    expect(stats.max).toBe(110);
  });

  it("flags out-of-range measurements", () => {
    const stats = analyzeThicknessStats({
      measurements: [{ value: 50 }, { value: 60 }, { value: 70 }],
      expectedRange: { min: 80, max: 120 },
    });
    expect(stats.outOfRange).toHaveLength(3);
    expect(classifyThicknessSeverity(stats)).toBe("alert");
  });

  it("flags extreme z-score outliers", () => {
    // 同一値が並んだ集団に 1 つだけ離れた値があれば stddev が小さく z が大きくなる
    const stats = analyzeThicknessStats({
      measurements: [
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 100 },
        { value: 150 },
      ],
    });
    expect(stats.outliers.length).toBeGreaterThanOrEqual(1);
    expect(classifyThicknessSeverity(stats)).toBe("watch");
  });

  it("returns ok for tight uniform measurements", () => {
    const stats = analyzeThicknessStats({
      measurements: [{ value: 100 }, { value: 101 }, { value: 99 }, { value: 100 }],
      expectedRange: { min: 80, max: 120 },
    });
    expect(classifyThicknessSeverity(stats)).toBe("ok");
  });
});
