import { describe, it, expect } from "vitest";
import { inventoryItemCreateSchema, inventoryItemUpdateSchema } from "../inventory";

describe("inventoryItemUpdateSchema — 部分更新でのテキスト項目の保全", () => {
  // 回帰防止: 省略された任意テキスト項目 (barcode/sku/category/note) は
  // undefined のままにし、PUT の update ループ (v !== undefined) で
  // 書き込み対象から外れること。null に化けると既存値を消してしまう。
  it("省略した barcode は undefined（キー不在）で、既存値を消さない", () => {
    const result = inventoryItemUpdateSchema.safeParse({ name: "コーティング剤A" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.barcode).toBeUndefined();
      expect("barcode" in result.data).toBe(false);
      // 同種の他項目も保全される
      expect("sku" in result.data).toBe(false);
      expect("category" in result.data).toBe(false);
      expect("note" in result.data).toBe(false);
    }
  });

  it("空文字の barcode は null（＝明示的なクリア）になる", () => {
    const result = inventoryItemUpdateSchema.safeParse({ barcode: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.barcode).toBeNull();
    }
  });

  it("barcode の前後空白はトリムされる", () => {
    const result = inventoryItemUpdateSchema.safeParse({ barcode: " 4901234567894 " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.barcode).toBe("4901234567894");
    }
  });
});

describe("inventoryItemCreateSchema — barcode", () => {
  it("barcode を受け付けてトリムする", () => {
    const result = inventoryItemCreateSchema.safeParse({ name: "品目", barcode: " 4900000000001 " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.barcode).toBe("4900000000001");
    }
  });

  it("barcode 省略時はキー不在（insert で DB 既定に委ねる）", () => {
    const result = inventoryItemCreateSchema.safeParse({ name: "品目" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("barcode" in result.data).toBe(false);
    }
  });
});
