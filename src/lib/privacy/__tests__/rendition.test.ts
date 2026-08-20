import { describe, it, expect } from "vitest";
import {
  MASKING_STRATEGIES,
  applyMask,
  createRendition,
  CERTIFICATE_PUBLIC_RULES,
  VEHICLE_PUBLIC_RULES,
  PASSPORT_PUBLIC_RULES,
  type MaskingRule,
} from "../rendition";

describe("MASKING_STRATEGIES", () => {
  it("4 戦略が定義されている", () => {
    expect(MASKING_STRATEGIES).toEqual(["nullify", "redact", "truncate", "hash"]);
  });
});

describe("applyMask", () => {
  it("nullify → null", () => {
    expect(applyMask("hello", "nullify")).toBeNull();
  });

  it("redact → デフォルト '***'", () => {
    expect(applyMask("secret", "redact")).toBe("***");
  });

  it("redact → カスタム置換文字列", () => {
    expect(applyMask("secret", "redact", { redactedValue: "[REDACTED]" })).toBe("[REDACTED]");
  });

  it("truncate → 先頭 keepChars + '***'", () => {
    expect(applyMask("田中太郎", "truncate", { keepChars: 2 })).toBe("田中***");
  });

  it("truncate keepChars=0 → '***'", () => {
    expect(applyMask("hello", "truncate")).toBe("***");
  });

  it("truncate keepChars >= 文字列長 → そのまま", () => {
    expect(applyMask("hi", "truncate", { keepChars: 5 })).toBe("hi");
  });

  it("hash → '[MASKED]'", () => {
    expect(applyMask("anything", "hash")).toBe("[MASKED]");
  });

  it("null 入力 → null（全戦略共通）", () => {
    for (const s of MASKING_STRATEGIES) {
      expect(applyMask(null, s)).toBeNull();
    }
  });

  it("undefined 入力 → null", () => {
    expect(applyMask(undefined, "nullify")).toBeNull();
  });

  it("数値入力 → truncate は文字列化してから切る", () => {
    expect(applyMask(12345, "truncate", { keepChars: 3 })).toBe("123***");
  });
});

describe("createRendition", () => {
  const rules: readonly MaskingRule[] = [
    { field: "name", appliesBelow: "tenant_internal", strategy: "nullify" },
    { field: "email", appliesBelow: "partner_shared", strategy: "redact" },
  ];

  const original = { name: "田中", email: "tanaka@example.com", id: "abc" };

  it("owner_only → 全フィールド可視", () => {
    const r = createRendition(original, rules, "owner_only");
    expect(r).toEqual(original);
  });

  it("tenant_internal → name 可視、email 可視（partner_shared 未満ではない）", () => {
    const r = createRendition(original, rules, "tenant_internal");
    expect(r.name).toBe("田中");
    expect(r.email).toBe("tanaka@example.com");
  });

  it("partner_shared → name マスク、email 可視", () => {
    const r = createRendition(original, rules, "partner_shared");
    expect(r.name).toBeNull();
    expect(r.email).toBe("tanaka@example.com");
  });

  it("public → name マスク、email マスク", () => {
    const r = createRendition(original, rules, "public");
    expect(r.name).toBeNull();
    expect(r.email).toBe("***");
  });

  it("非破壊（元のオブジェクトは変更されない）", () => {
    const copy = { ...original };
    createRendition(original, rules, "public");
    expect(original).toEqual(copy);
  });

  it("ルールに無いフィールドはそのまま", () => {
    const r = createRendition(original, rules, "public");
    expect(r.id).toBe("abc");
  });
});

describe("定義済みルール", () => {
  it("CERTIFICATE_PUBLIC_RULES — customer_name, content_free_text を nullify", () => {
    expect(CERTIFICATE_PUBLIC_RULES).toHaveLength(2);
    expect(CERTIFICATE_PUBLIC_RULES.map((r) => r.field).sort()).toEqual(["content_free_text", "customer_name"]);
    for (const r of CERTIFICATE_PUBLIC_RULES) {
      expect(r.strategy).toBe("nullify");
      expect(r.appliesBelow).toBe("tenant_internal");
    }
  });

  it("VEHICLE_PUBLIC_RULES — PII 5 カラムを nullify", () => {
    expect(VEHICLE_PUBLIC_RULES).toHaveLength(5);
    for (const r of VEHICLE_PUBLIC_RULES) {
      expect(r.strategy).toBe("nullify");
    }
  });

  it("PASSPORT_PUBLIC_RULES — オーナー PII を partner_shared 未満で nullify", () => {
    expect(PASSPORT_PUBLIC_RULES).toHaveLength(2);
    for (const r of PASSPORT_PUBLIC_RULES) {
      expect(r.appliesBelow).toBe("partner_shared");
      expect(r.strategy).toBe("nullify");
    }
  });
});
