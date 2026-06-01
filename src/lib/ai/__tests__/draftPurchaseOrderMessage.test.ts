import { describe, it, expect } from "vitest";
import {
  buildFallbackPurchaseOrderMessage,
  generatePurchaseOrderMessage,
  type PurchaseOrderMessageInput,
} from "../draftPurchaseOrderMessage";

const INPUT: PurchaseOrderMessageInput = {
  shopName: "テスト整備店",
  supplierName: "サンプル商会株式会社",
  poNumber: "PO-20260601-1234",
  items: [
    { name: "ガラスコーティング剤 500ml", sku: "GC-500", quantity: 3, unit_cost: 3200 },
    { name: "PPFフィルム A4", sku: "PPF-A4", quantity: 10, unit_cost: 1800 },
  ],
  subtotal: 3 * 3200 + 10 * 1800,
  note: "至急でお願いします",
  desiredLeadTimeDays: 3,
};

describe("buildFallbackPurchaseOrderMessage", () => {
  it("includes shop, supplier, PO number and subtotal", () => {
    const r = buildFallbackPurchaseOrderMessage(INPUT);
    expect(r.fallback).toBe(true);
    expect(r.subject).toContain("PO-20260601-1234");
    expect(r.subject).toContain("テスト整備店");
    expect(r.body).toContain("サンプル商会株式会社");
    expect(r.body).toContain("PO-20260601-1234");
    // 壁3: 合計金額は入力どおり (3×3200 + 10×1800 = ¥27,600)
    expect(r.body).toContain("¥27,600");
  });

  it("lists every item with its exact quantity (no AI invented numbers)", () => {
    const r = buildFallbackPurchaseOrderMessage(INPUT);
    expect(r.body).toContain("ガラスコーティング剤 500ml");
    expect(r.body).toContain("× 3");
    expect(r.body).toContain("PPFフィルム A4");
    expect(r.body).toContain("× 10");
  });

  it("includes the note when present", () => {
    expect(buildFallbackPurchaseOrderMessage(INPUT).body).toContain("至急でお願いします");
  });

  it("handles empty items and null unit_cost without throwing", () => {
    const r = buildFallbackPurchaseOrderMessage({
      shopName: "店",
      supplierName: "卸",
      poNumber: "PO-X",
      items: [],
      subtotal: 0,
      note: null,
      desiredLeadTimeDays: null,
    });
    expect(r.body).toContain("（明細なし）");
    expect(r.body).toContain("¥0");
  });
});

describe("generatePurchaseOrderMessage (AI失敗時フォールバック)", () => {
  it("falls back deterministically when the AI client is unavailable", async () => {
    // テスト環境では ANTHROPIC_API_KEY 未設定のため getAnthropicClient が throw し、
    // 決定論フォールバックに落ちる。数値は入力どおり保たれる (壁3)。
    const r = await generatePurchaseOrderMessage(INPUT);
    expect(r.fallback).toBe(true);
    expect(r.body).toContain("¥27,600");
    expect(r.body).toContain("PO-20260601-1234");
    expect(r.body).toContain("× 3");
    expect(r.body).toContain("× 10");
  });
});
