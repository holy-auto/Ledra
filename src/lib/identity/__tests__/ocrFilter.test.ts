import { describe, it, expect } from "vitest";
import {
  containsMyNumber,
  scanForMyNumber,
  stripSensitiveTokens,
  coarsenAddress,
  sanitizeOcrResult,
} from "../ocrFilter";
import type { OcrResult } from "../ocrSchema";

function fixture(overrides: Partial<OcrResult> = {}): OcrResult {
  return {
    doc_type: "driver_license",
    confidence: 0.9,
    fields: {
      name: "山田 太郎",
      birth_date: "1990-01-23",
      postal_code: "150-0043",
      address: "東京都渋谷区道玄坂1-2-3",
    },
    rejected_reasons: [],
    warnings: [],
    ...overrides,
  };
}

describe("containsMyNumber", () => {
  it("detects raw 12-digit sequence", () => {
    expect(containsMyNumber("123456789012")).toBe(true);
  });

  it("detects 4-4-4 hyphenated form", () => {
    expect(containsMyNumber("1234-5678-9012")).toBe(true);
  });

  it("detects spaced 4-4-4 form", () => {
    expect(containsMyNumber("1234 5678 9012")).toBe(true);
  });

  it("does NOT false-positive on a 7-digit postal code", () => {
    expect(containsMyNumber("150-0043")).toBe(false);
  });

  it("does NOT false-positive on an 11-digit phone number", () => {
    expect(containsMyNumber("090-1234-5678")).toBe(false);
  });

  it("does NOT false-positive on a 13-digit credit card prefix", () => {
    expect(containsMyNumber("1234567890123")).toBe(false);
  });

  it("ignores empty input", () => {
    expect(containsMyNumber("")).toBe(false);
  });
});

describe("scanForMyNumber", () => {
  it("finds my-number nested in fields.address", () => {
    const r = fixture({ fields: { address: "東京都渋谷区 1234 5678 9012" } });
    expect(scanForMyNumber(r)).toBe(true);
  });

  it("finds my-number inside warnings array", () => {
    const r = fixture({ warnings: ["参考: 1234-5678-9012 を読み取りました"] });
    expect(scanForMyNumber(r)).toBe(true);
  });

  it("returns false for a clean result", () => {
    expect(scanForMyNumber(fixture())).toBe(false);
  });
});

describe("stripSensitiveTokens", () => {
  it("removes 本籍 field with value", () => {
    expect(stripSensitiveTokens("本籍: 東京都千代田区永田町1-1-1")).toBe("本籍: [REDACTED]");
  });

  it("masks full passport number keeping last 4", () => {
    expect(stripSensitiveTokens("TR1234567 を確認")).toBe("XX***4567 を確認");
  });

  it("removes 保険者番号 with digits", () => {
    expect(stripSensitiveTokens("保険者番号: 12345678")).toBe("保険者番号[REDACTED]");
  });

  it("returns empty string unchanged", () => {
    expect(stripSensitiveTokens("")).toBe("");
  });
});

describe("coarsenAddress", () => {
  it("trims to prefecture + ward", () => {
    expect(coarsenAddress("東京都渋谷区道玄坂1-2-3 渋谷ビル4F")).toBe("東京都渋谷区");
  });

  it("trims to prefecture + city", () => {
    expect(coarsenAddress("神奈川県横浜市西区みなとみらい2-3-1")).toBe("神奈川県横浜市");
  });

  it("returns original if no city marker found", () => {
    expect(coarsenAddress("どこか不明な住所")).toBe("どこか不明な住所");
  });
});

describe("sanitizeOcrResult", () => {
  it("rejects entire result if my-number leaks anywhere", () => {
    const r = fixture({ fields: { address: "東京都 1234 5678 9012" } });
    const { status, sanitized } = sanitizeOcrResult(r);
    expect(status).toBe("rejected");
    expect(sanitized.fields).toEqual({});
    expect(sanitized.rejected_reasons.some((m) => m.includes("マイナンバー"))).toBe(true);
  });

  it("strips 本籍 from address while keeping other fields", () => {
    const r = fixture({
      fields: {
        name: "山田 太郎",
        address: "本籍 東京都千代田区永田町1-1-1",
      },
    });
    const { status, sanitized } = sanitizeOcrResult(r);
    expect(status).toBe("ok");
    expect(sanitized.fields.name).toBe("山田 太郎");
    expect(sanitized.fields.address).toBeUndefined();
    expect(sanitized.rejected_reasons.some((m) => m.includes("本籍"))).toBe(true);
  });

  it("passes through clean result", () => {
    const r = fixture();
    const { status, sanitized } = sanitizeOcrResult(r);
    expect(status).toBe("ok");
    expect(sanitized.fields.name).toBe("山田 太郎");
    expect(sanitized.fields.address).toBe("東京都渋谷区道玄坂1-2-3");
  });
});
