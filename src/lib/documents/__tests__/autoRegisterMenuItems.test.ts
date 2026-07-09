import { describe, it, expect } from "vitest";
import { autoRegisterMenuItems } from "../autoRegisterMenuItems";

/**
 * 帳票明細から品目マスタへの自動登録ロジックを検証する。
 * menu_items の select(既存品目の一覧取得) と insert をモックする。
 */
function makeAdmin(existing: Array<{ name: string; description?: string | null; item_code?: string | null }> = []) {
  const inserts: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      if (table !== "menu_items") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: existing.map((e) => ({
                name: e.name,
                description: e.description ?? null,
                item_code: e.item_code ?? null,
              })),
              error: null,
            }),
        }),
        insert: (rows: Array<Record<string, unknown>>) => {
          inserts.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin: admin as never, inserts };
}

describe("autoRegisterMenuItems", () => {
  it("品番も品目名も未登録の新規品目は登録する", async () => {
    const { admin, inserts } = makeAdmin();
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "新規コーティング", item_code: "GC-999", unit_price: 5000, quantity: 1 },
    ]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      tenant_id: "t1",
      name: "新規コーティング",
      item_code: "GC-999",
      unit_price: 5000,
    });
  });

  it("品番が既存と一致する品目は登録しない", async () => {
    const { admin, inserts } = makeAdmin([{ name: "ガラスコーティング", item_code: "GC-001" }]);
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "ガラスコーティング", item_code: "GC-001", unit_price: 55000 },
    ]);
    expect(inserts).toHaveLength(0);
  });

  it("品番が大小文字違いでも既存と一致すれば登録しない", async () => {
    const { admin, inserts } = makeAdmin([{ name: "ガラスコーティング", item_code: "GC-001" }]);
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "ガラスコーティング", item_code: "gc-001", unit_price: 55000 },
    ]);
    expect(inserts).toHaveLength(0);
  });

  it("品番未入力でも品目名が既存と一致すれば登録しない", async () => {
    const { admin, inserts } = makeAdmin([{ name: "ヘッドライト磨き" }]);
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "ヘッドライト磨き", unit_price: 8000 },
    ]);
    expect(inserts).toHaveLength(0);
  });

  it("品目マスタから選択した明細(名前+説明が連結された description)は品番なしでも重複登録しない", async () => {
    const { admin, inserts } = makeAdmin([{ name: "ヘッドライト磨き", description: "簡易施工" }]);
    // handleMenuItemSelect は description を "name (description)" の形で明細に設定する
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "ヘッドライト磨き (簡易施工)", unit_price: 8000 },
    ]);
    expect(inserts).toHaveLength(0);
  });

  it("見出し行・小計行・空欄の行は対象外", async () => {
    const { admin, inserts } = makeAdmin();
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "heading", description: "施工内容" },
      { item_type: "subtotal", description: "小計" },
      { item_type: "item", description: "", unit_price: 1000 },
    ]);
    expect(inserts).toHaveLength(0);
  });

  it("同一バッチ内の重複行は1件のみ登録する", async () => {
    const { admin, inserts } = makeAdmin();
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "新規メニュー", item_code: "NEW-1", unit_price: 3000 },
      { item_type: "item", description: "新規メニュー", item_code: "NEW-1", unit_price: 3000 },
    ]);
    expect(inserts).toHaveLength(1);
  });

  it("同一バッチ内で品番あり/なしの同名行が混在しても1件のみ登録する", async () => {
    const { admin, inserts } = makeAdmin();
    await autoRegisterMenuItems(admin, "t1", [
      { item_type: "item", description: "新規メニュー", item_code: "NEW-1", unit_price: 3000 },
      { item_type: "item", description: "新規メニュー", unit_price: 3000 },
    ]);
    expect(inserts).toHaveLength(1);
  });
});
