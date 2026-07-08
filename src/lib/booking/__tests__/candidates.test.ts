import { describe, it, expect } from "vitest";
import { proposeCandidates } from "../candidates";

// 2026-07-13 は月曜(1), 07-14 火(2), 07-18 土(6), 07-19 日(0)
const SLOTS = [
  { day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00", max_bookings: 1 },
  { day_of_week: 1, start_time: "13:00:00", end_time: "15:00:00", max_bookings: 2 },
  { day_of_week: 2, start_time: "09:00:00", end_time: "10:00:00", max_bookings: 1 },
];

describe("proposeCandidates", () => {
  it("returns slots on open days, skipping days without slots", () => {
    const c = proposeCandidates({
      dates: ["2026-07-13", "2026-07-14", "2026-07-15"], // 月・火・水(枠なし)
      slots: SLOTS,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
    });
    expect(c.map((x) => `${x.date} ${x.start_time}`)).toEqual([
      "2026-07-13 09:00",
      "2026-07-13 13:00",
      "2026-07-14 09:00",
    ]);
  });

  it("skips weekly and specific closed days", () => {
    const c = proposeCandidates({
      dates: ["2026-07-13", "2026-07-14"],
      slots: SLOTS,
      closedDays: [
        { type: "weekly", day_of_week: 1 }, // 月曜定休
        { type: "specific", closed_date: "2026-07-14" },
      ],
      reservations: [],
      estimatedMinutes: null,
    });
    expect(c).toHaveLength(0);
  });

  it("excludes full slots by exclusive-boundary overlap and reports remaining", () => {
    const c = proposeCandidates({
      dates: ["2026-07-13"],
      slots: SLOTS,
      closedDays: [],
      // 09:00-12:00 枠(定員1)を1件埋める。隣接する 12:00 開始は重複扱いしない。
      reservations: [{ scheduled_date: "2026-07-13", start_time: "09:00:00", end_time: "12:00:00" }],
      estimatedMinutes: null,
    });
    // 午前枠は満席で除外、午後(13-15, 定員2)のみ残る
    expect(c.map((x) => x.start_time)).toEqual(["13:00"]);
    expect(c[0].remaining).toBe(2);
  });

  it("flags whether the estimated duration fits and caps end_time", () => {
    const c = proposeCandidates({
      dates: ["2026-07-13", "2026-07-14"],
      slots: SLOTS,
      closedDays: [],
      reservations: [],
      estimatedMinutes: 150, // 2時間半
    });
    const mon09 = c.find((x) => x.date === "2026-07-13" && x.start_time === "09:00")!;
    expect(mon09.fits).toBe(true); // 3時間枠に収まる
    expect(mon09.end_time).toBe("11:30"); // 09:00 + 150分
    const tue09 = c.find((x) => x.date === "2026-07-14")!;
    expect(tue09.fits).toBe(false); // 1時間枠には収まらない
    expect(tue09.end_time).toBe("10:00"); // スロット終了で頭打ち
  });

  it("requires a free loaner when needsLoaner is set", () => {
    const base = {
      dates: ["2026-07-13", "2026-07-14"],
      slots: SLOTS,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
      needsLoaner: true,
    };
    const none = proposeCandidates({ ...base, freeLoanersByDate: { "2026-07-13": 0, "2026-07-14": 0 } });
    expect(none).toHaveLength(0);
    const some = proposeCandidates({ ...base, freeLoanersByDate: { "2026-07-13": 1, "2026-07-14": 0 } });
    expect(some.every((x) => x.date === "2026-07-13")).toBe(true);
    expect(some[0].loaner_free).toBe(1);
  });

  it("filters slots by accepted work categories (受入可否)", () => {
    const catSlots = [
      // 午前は洗車のみ受入、午後はすべて受入
      { day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00", max_bookings: 1, accepted_categories: ["洗車"] },
      { day_of_week: 1, start_time: "13:00:00", end_time: "15:00:00", max_bookings: 1, accepted_categories: null },
    ];
    // コーティングの予約 → 午前(洗車のみ)は除外、午後のみ
    const coating = proposeCandidates({
      dates: ["2026-07-13"],
      slots: catSlots,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
      workCategories: ["コーティング"],
    });
    expect(coating.map((x) => x.start_time)).toEqual(["13:00"]);
    // 洗車の予約 → 両方受入
    const wash = proposeCandidates({
      dates: ["2026-07-13"],
      slots: catSlots,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
      workCategories: ["洗車"],
    });
    expect(wash.map((x) => x.start_time)).toEqual(["09:00", "13:00"]);
    expect(wash[0].accepted_categories).toEqual(["洗車"]);
    // 作業カテゴリ未指定 → 絞り込みなし（両方）
    const nofilter = proposeCandidates({
      dates: ["2026-07-13"],
      slots: catSlots,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
    });
    expect(nofilter).toHaveLength(2);
  });

  it("respects the limit", () => {
    const c = proposeCandidates({
      dates: ["2026-07-13", "2026-07-14"],
      slots: SLOTS,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
      limit: 2,
    });
    expect(c).toHaveLength(2);
  });
});
