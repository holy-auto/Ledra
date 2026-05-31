import { describe, it, expect } from "vitest";
import {
  computeReorderQuantity,
  needsReorder,
  computeReorderGroups,
  type ReorderableItem,
} from "@/lib/inventory/reorder";

function item(over: Partial<ReorderableItem>): ReorderableItem {
  return {
    id: "i1",
    name: "コンパウンド",
    sku: null,
    supplier_id: "sup-1",
    current_stock: 0,
    min_stock: 5,
    reorder_qty: null,
    unit_cost: null,
    ...over,
  };
}

describe("computeReorderQuantity", () => {
  it("uses reorder_qty when positive (rounded up)", () => {
    expect(computeReorderQuantity({ current_stock: 0, min_stock: 5, reorder_qty: 12 })).toBe(12);
    expect(computeReorderQuantity({ current_stock: 0, min_stock: 5, reorder_qty: 11.2 })).toBe(12);
  });
  it("falls back to deficit-to-min (ceil, min 1)", () => {
    expect(computeReorderQuantity({ current_stock: 1, min_stock: 5, reorder_qty: null })).toBe(4);
    expect(computeReorderQuantity({ current_stock: 4.5, min_stock: 5, reorder_qty: null })).toBe(1);
    // already at min → still at least 1
    expect(computeReorderQuantity({ current_stock: 5, min_stock: 5, reorder_qty: null })).toBe(1);
    // reorder_qty 0 is treated as unset
    expect(computeReorderQuantity({ current_stock: 2, min_stock: 6, reorder_qty: 0 })).toBe(4);
  });
});

describe("needsReorder", () => {
  it("true only when below/at min + min>0 + has supplier", () => {
    expect(needsReorder(item({ current_stock: 2, min_stock: 5 }))).toBe(true);
    expect(needsReorder(item({ current_stock: 5, min_stock: 5 }))).toBe(true); // at min
    expect(needsReorder(item({ current_stock: 6, min_stock: 5 }))).toBe(false); // above
    expect(needsReorder(item({ current_stock: 0, min_stock: 0 }))).toBe(false); // no min set
    expect(needsReorder(item({ current_stock: 0, min_stock: 5, supplier_id: null }))).toBe(false); // no supplier
  });
});

describe("computeReorderGroups", () => {
  it("groups low items by supplier and sums amounts", () => {
    const groups = computeReorderGroups([
      item({ id: "a", supplier_id: "s1", current_stock: 0, min_stock: 10, reorder_qty: 10, unit_cost: 100 }),
      item({ id: "b", supplier_id: "s1", current_stock: 1, min_stock: 5, reorder_qty: null, unit_cost: 50 }),
      item({ id: "c", supplier_id: "s2", current_stock: 0, min_stock: 2, reorder_qty: 2, unit_cost: 1000 }),
      item({ id: "d", supplier_id: "s1", current_stock: 99, min_stock: 5, unit_cost: 100 }), // not low → excluded
      item({ id: "e", supplier_id: null, current_stock: 0, min_stock: 5, unit_cost: 100 }), // no supplier → excluded
    ]);

    // s2 subtotal 2000 > s1 subtotal (10*100 + 4*50 = 1200) → s2 first (sorted desc)
    expect(groups.map((g) => g.supplier_id)).toEqual(["s2", "s1"]);

    const s1 = groups.find((g) => g.supplier_id === "s1")!;
    expect(s1.lines.map((l) => l.item_id).sort()).toEqual(["a", "b"]);
    expect(s1.subtotal).toBe(10 * 100 + 4 * 50);

    const s2 = groups.find((g) => g.supplier_id === "s2")!;
    expect(s2.subtotal).toBe(2 * 1000);
  });

  it("amount is 0 when unit_cost is null (still creates the line)", () => {
    const groups = computeReorderGroups([
      item({ id: "a", supplier_id: "s1", current_stock: 0, min_stock: 3, reorder_qty: 3, unit_cost: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lines[0].amount).toBe(0);
    expect(groups[0].lines[0].quantity).toBe(3);
    expect(groups[0].subtotal).toBe(0);
  });

  it("returns empty when nothing needs reorder", () => {
    expect(computeReorderGroups([item({ current_stock: 100, min_stock: 5 })])).toEqual([]);
  });
});
