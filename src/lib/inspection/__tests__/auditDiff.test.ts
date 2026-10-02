import { describe, it, expect } from "vitest";
import { changedFields } from "../auditDiff";

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
});
