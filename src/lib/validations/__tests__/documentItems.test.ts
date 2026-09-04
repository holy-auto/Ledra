/**
 * 帳票の明細が `items` 一本で通ることを固定する。
 *
 * かつて `documentCreateSchema` に `items_json`（`documentItemSchema` の配列）が
 * 並んで存在したが、実際に保存・読込される形と**完全に非互換**だった
 * （`type` vs `item_type` / `name` vs `description` / 文字列 vs 数値の `tax_category`）。
 * ルートは `input.items` しか読まないので無害だったが、`items_json` を使う経路へ
 * 切り替えた瞬間に全明細が弾かれる地雷になっていた（2026-09-04 に削除）。
 *
 * ここで固定するのは2つ。
 *   1. 明細の入口は `items` だけ
 *   2. `items_json` を送っても parse 結果に現れない（＝再び結線されない）
 *
 * 保存形そのものの検証は `calcItems` 側のテストが持つ。ここは入口の話だけ。
 */
import { describe, it, expect } from "vitest";
import { documentCreateSchema, documentUpdateSchema } from "@/lib/validations/document";

const ID = "11111111-1111-4111-8111-111111111111";

/** 実データの形（`calcItems()` の出力・`@/types/document` の `DocumentItem`）。 */
const REAL_ITEM = {
  item_type: "item",
  description: "バンパー脱着",
  quantity: 1,
  unit_price: 12000,
  amount: 12000,
  tax_category: 10,
};

describe("帳票の明細は items 一本で通る", () => {
  it("実データ形状の明細を items で受け取れる", () => {
    const p = documentCreateSchema.parse({ doc_type: "estimate", items: [REAL_ITEM] });
    expect(p.items).toEqual([REAL_ITEM]);
  });

  it("items_json は受け口が無い（送っても parse 結果に現れない）", () => {
    const p = documentCreateSchema.parse({ doc_type: "estimate", items_json: [REAL_ITEM] });
    expect(p).not.toHaveProperty("items_json");
  });

  it("更新スキーマでも同じ（partial 経由で復活していない）", () => {
    const p = documentUpdateSchema.parse({ id: ID, items: [REAL_ITEM], items_json: [REAL_ITEM] });
    expect(p.items).toEqual([REAL_ITEM]);
    expect(p).not.toHaveProperty("items_json");
  });

  it("旧 documentItemSchema の形（type / name / 文字列 tax_category）も items なら通る", () => {
    // 明細の形は calcItems が吸収する。入口のスキーマで弾かないことを確かめる
    // （かつての items_json はこの形しか受け付けず、実データの方を弾いていた）。
    const legacyShape = { type: "line", name: "旧形式", quantity: 1, unit_price: 1, tax_category: "standard" };
    const p = documentCreateSchema.parse({ doc_type: "estimate", items: [legacyShape] });
    expect(p.items).toEqual([legacyShape]);
  });

  it("明細は 500 行まで", () => {
    const over = Array.from({ length: 501 }, () => REAL_ITEM);
    expect(documentCreateSchema.safeParse({ doc_type: "estimate", items: over }).success).toBe(false);
  });
});
