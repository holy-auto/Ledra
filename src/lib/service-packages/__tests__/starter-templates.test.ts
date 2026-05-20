import { describe, it, expect } from "vitest";
import { STARTER_PACKAGES, uniqueStarterMenuItems } from "@/lib/service-packages/starter-templates";
import { SERVICE_PACKAGE_CATEGORIES, PRICE_STRATEGIES } from "@/lib/validations/service-package";

describe("STARTER_PACKAGES", () => {
  it("has unique keys", () => {
    const keys = STARTER_PACKAGES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique names", () => {
    const names = STARTER_PACKAGES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses valid categories", () => {
    for (const p of STARTER_PACKAGES) {
      expect(SERVICE_PACKAGE_CATEGORIES).toContain(p.category);
    }
  });

  it("uses valid price_strategy", () => {
    for (const p of STARTER_PACKAGES) {
      expect(PRICE_STRATEGIES).toContain(p.price_strategy);
    }
  });

  it("requires fixed_price for price_strategy='fixed'", () => {
    for (const p of STARTER_PACKAGES) {
      if (p.price_strategy === "fixed") {
        expect(p.fixed_price).toBeTypeOf("number");
        expect(p.fixed_price).toBeGreaterThan(0);
      }
    }
  });

  it("every package has at least one item with positive unit_price and quantity", () => {
    for (const p of STARTER_PACKAGES) {
      expect(p.items.length).toBeGreaterThan(0);
      for (const it of p.items) {
        expect(it.unit_price).toBeGreaterThanOrEqual(0);
        expect(it.quantity).toBeGreaterThan(0);
      }
    }
  });

  it("covers core categories (coating / ppf / detailing / maintenance)", () => {
    const cats = new Set(STARTER_PACKAGES.map((p) => p.category));
    expect(cats.has("coating")).toBe(true);
    expect(cats.has("ppf")).toBe(true);
    expect(cats.has("detailing")).toBe(true);
    expect(cats.has("maintenance")).toBe(true);
  });
});

describe("uniqueStarterMenuItems", () => {
  it("deduplicates by name (case-insensitive)", () => {
    const dupes = [
      {
        key: "a",
        name: "P-A",
        description: "",
        category: "coating" as const,
        price_strategy: "sum_of_items" as const,
        items: [
          { name: "下地処理 (標準)", unit_price: 12000, quantity: 1 },
          { name: "鉄粉除去", unit_price: 6000, quantity: 1 },
        ],
      },
      {
        key: "b",
        name: "P-B",
        description: "",
        category: "coating" as const,
        price_strategy: "sum_of_items" as const,
        items: [
          { name: "下地処理 (標準)", unit_price: 99999, quantity: 1 },
          { name: "ボディ磨き (1 工程)", unit_price: 25000, quantity: 1 },
        ],
      },
    ];
    const out = uniqueStarterMenuItems(dupes);
    const names = out.map((i) => i.name);
    expect(names).toEqual(["下地処理 (標準)", "鉄粉除去", "ボディ磨き (1 工程)"]);
    // First occurrence wins (unit_price 12000, not 99999)
    expect(out.find((i) => i.name === "下地処理 (標準)")?.unit_price).toBe(12000);
  });

  it("returns the live STARTER_PACKAGES' uniqued menu items without duplicates", () => {
    const out = uniqueStarterMenuItems();
    const lowered = out.map((i) => i.name.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });
});
