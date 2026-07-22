/**
 * 複数カレンダー同期の純関数テスト。
 *  - desiredReservationFields: busy モードは予定名・内容を隠して「予定あり」ブロックにする（個人予定の非表示）。
 *  - normalizeReadCalendars: 不正値・重複・メイン(除外ID)を排除して安全な配列にする。
 */
import { describe, it, expect } from "vitest";
import { desiredReservationFields, normalizeReadCalendars } from "../client";

describe("desiredReservationFields", () => {
  it("full は予定名・詳細をそのまま取り込む", () => {
    expect(desiredReservationFields("三菱MTG", "資料URL", "full")).toEqual({ title: "三菱MTG", note: "資料URL" });
  });

  it("full で予定名が空なら (無題)、詳細なしは null", () => {
    expect(desiredReservationFields("", null, "full")).toEqual({ title: "(無題)", note: null });
    expect(desiredReservationFields(undefined, undefined, "full")).toEqual({ title: "(無題)", note: null });
  });

  it("busy は中身に関係なく『予定あり』で内容を隠す（個人予定の非表示）", () => {
    expect(desiredReservationFields("歯医者 15時", "本町クリニック", "busy")).toEqual({
      title: "予定あり",
      note: null,
    });
    expect(desiredReservationFields("", "", "busy")).toEqual({ title: "予定あり", note: null });
  });
});

describe("normalizeReadCalendars", () => {
  it("有効な full/busy だけ残す", () => {
    const out = normalizeReadCalendars([
      { id: "a@g.com", mode: "full" },
      { id: "b@g.com", mode: "busy" },
    ]);
    expect(out).toEqual([
      { id: "a@g.com", mode: "full" },
      { id: "b@g.com", mode: "busy" },
    ]);
  });

  it("不正な mode・id 欠落・配列以外は落とす", () => {
    expect(normalizeReadCalendars([{ id: "x", mode: "readonly" }, { mode: "full" }, { id: "" }, 42, null])).toEqual([]);
    expect(normalizeReadCalendars(null)).toEqual([]);
    expect(normalizeReadCalendars("nope")).toEqual([]);
  });

  it("重複IDは1つに、excludeId(メイン=書き込み先)は除外する", () => {
    const out = normalizeReadCalendars(
      [
        { id: "main@g.com", mode: "full" }, // = excludeId → 除外
        { id: "dup@g.com", mode: "full" },
        { id: "dup@g.com", mode: "busy" }, // 重複 → 先勝ち
      ],
      "main@g.com",
    );
    expect(out).toEqual([{ id: "dup@g.com", mode: "full" }]);
  });
});
