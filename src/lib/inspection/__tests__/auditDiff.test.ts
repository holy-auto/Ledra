import { describe, it, expect } from "vitest";
import { changedFields, changedFieldKeys } from "../auditDiff";

describe("changedFields [G2 指定整備記録簿の更新箇所]", () => {
  it("変わったフィールドだけを old/new で返す", () => {
    const before = { notes: "旧メモ", inspector_name: "田中", inspected_at: "2026-10-01T00:00:00Z" };
    const updates = { notes: "新メモ", inspector_name: "田中" }; // notes だけ変更
    expect(changedFields(before, updates)).toEqual({
      notes: { old: "旧メモ", new: "新メモ" },
    });
  });

  it("jsonb/配列も内容で比較する（answers・photo_urls）", () => {
    const before = { answers: { a: { value: 1 } }, photo_urls: ["x.jpg"] };
    const updates = { answers: { a: { value: 2 } }, photo_urls: ["x.jpg"] }; // answers のみ変更
    const diff = changedFields(before, updates);
    expect(Object.keys(diff)).toEqual(["answers"]);
    expect(diff.answers.new).toEqual({ a: { value: 2 } });
  });

  it("null ↔ 値の変化を拾い、null ↔ undefined は変化と見なさない", () => {
    expect(changedFields({ customer_id: null }, { customer_id: "c1" })).toEqual({
      customer_id: { old: null, new: "c1" },
    });
    // 旧行に無いキー(undefined) を null で更新しても「変化なし」
    expect(changedFields({}, { customer_id: null })).toEqual({});
  });

  it("更新前の行が無い（null）なら、全フィールドを new 側として返す", () => {
    expect(changedFields(null, { notes: "x" })).toEqual({ notes: { old: null, new: "x" } });
  });

  it("変化が無ければ空オブジェクト", () => {
    expect(changedFields({ notes: "a" }, { notes: "a" })).toEqual({});
  });

  it("jsonb のキー順違い（DB正規化 vs 挿入順）は変更と見なさない", () => {
    // DB 返却（キー正規化）と calcItems 由来（挿入順）で中身は同じ。誤って「変更あり」にしない。
    const before = { items_json: [{ amount: 100, name: "A", price: 100 }] };
    const updates = { items_json: [{ name: "A", price: 100, amount: 100 }] };
    expect(changedFields(before, updates)).toEqual({});
  });

  it("配列の順序違いは変更として検出する（明細の並べ替えは実変更）", () => {
    const before = { items_json: [{ name: "A" }, { name: "B" }] };
    const updates = { items_json: [{ name: "B" }, { name: "A" }] };
    expect(Object.keys(changedFields(before, updates))).toEqual(["items_json"]);
  });
});

describe("changedFieldKeys [G2 documents/body_repair 更新箇所・列名のみ]", () => {
  it("変わった列名だけを返す（前後値は載せない＝PII 複製・肥大の回避）", () => {
    const before = { recipient_name: "田中 太郎", recipient_address: "東京都…", total: 10000, status: "draft" };
    const updates = { recipient_name: "田中 太郎", recipient_address: "大阪府…", total: 12000, status: "draft" };
    expect(changedFieldKeys(before, updates)).toEqual(["recipient_address", "total"]);
  });

  it("jsonb/配列も内容で比較する（items_json）", () => {
    const before = { items_json: [{ name: "a", price: 1 }], note: "x" };
    const updates = { items_json: [{ name: "a", price: 2 }], note: "x" };
    expect(changedFieldKeys(before, updates)).toEqual(["items_json"]);
  });

  it("null ↔ 値は変化、null ↔ undefined は変化と見なさない", () => {
    expect(changedFieldKeys({ customer_id: null }, { customer_id: "c1" })).toEqual(["customer_id"]);
    expect(changedFieldKeys({}, { customer_id: null })).toEqual([]);
  });

  it("更新前の行が無い（null）なら全キーを返す / 変化無しは空配列", () => {
    expect(changedFieldKeys(null, { stage: "paint" })).toEqual(["stage"]);
    expect(changedFieldKeys({ stage: "paint" }, { stage: "paint" })).toEqual([]);
  });
});
