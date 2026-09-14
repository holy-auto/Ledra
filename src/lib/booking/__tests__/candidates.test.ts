import { describe, it, expect } from "vitest";
import { proposeCandidates, computeFreeLoanersByDate } from "../candidates";

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

  it("requires a slot to accept ALL requested categories for composite work", () => {
    const catSlots = [
      // 洗車のみ受入 / コーティングのみ受入 / 両方受入
      { day_of_week: 1, start_time: "09:00:00", end_time: "10:00:00", max_bookings: 1, accepted_categories: ["洗車"] },
      {
        day_of_week: 1,
        start_time: "10:00:00",
        end_time: "11:00:00",
        max_bookings: 1,
        accepted_categories: ["コーティング"],
      },
      {
        day_of_week: 1,
        start_time: "11:00:00",
        end_time: "12:00:00",
        max_bookings: 1,
        accepted_categories: ["洗車", "コーティング"],
      },
    ];
    // 洗車+コーティングの複合作業 → 両方受け入れる 11:00 枠のみ
    const composite = proposeCandidates({
      dates: ["2026-07-13"],
      slots: catSlots,
      closedDays: [],
      reservations: [],
      estimatedMinutes: null,
      workCategories: ["洗車", "コーティング"],
    });
    expect(composite.map((x) => x.start_time)).toEqual(["11:00"]);
  });

  it("accounts for staff headroom (人手の余り) using shift time windows", () => {
    // 月 09-12(定員2)。既存予約1件(09-12) → booked=1。
    const staffSlots = [{ day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00", max_bookings: 2 }];
    const resv = [{ scheduled_date: "2026-07-13", start_time: "09:00:00", end_time: "12:00:00" }];
    const base = {
      dates: ["2026-07-13"],
      slots: staffSlots,
      closedDays: [],
      reservations: resv,
      estimatedMinutes: null,
      considerStaff: true,
    };
    // 終日勤務1名(null/null) → 空き人手 1-1=0 → 除外
    const noStaff = proposeCandidates({
      ...base,
      staffShiftsByDate: { "2026-07-13": [{ staffId: "a", start: null, end: null }] },
    });
    expect(noStaff).toHaveLength(0);
    // 3名が枠をカバー → 空き人手 3-1=2、残枠 min(2-1,2)=1
    const withStaff = proposeCandidates({
      ...base,
      staffShiftsByDate: {
        "2026-07-13": [
          { staffId: "a", start: 540, end: 720 },
          { staffId: "b", start: null, end: null },
          { staffId: "c", start: 480, end: 1080 },
        ],
      },
    });
    expect(withStaff).toHaveLength(1);
    expect(withStaff[0].staff_free).toBe(2);
    expect(withStaff[0].remaining).toBe(1);
    // 午後シフトのみ(13:00-)は 09-12 枠をカバーしない → カバー0、除外
    const afternoonOnly = proposeCandidates({
      ...base,
      staffShiftsByDate: { "2026-07-13": [{ staffId: "a", start: 780, end: 1080 }] },
    });
    expect(afternoonOnly).toHaveLength(0);
    // 同一スタッフの重複シフトは実人数として1カウント（booked=1 → 空き0 → 除外）
    const dupSameStaff = proposeCandidates({
      ...base,
      staffShiftsByDate: {
        "2026-07-13": [
          { staffId: "a", start: 540, end: 720 },
          { staffId: "a", start: 540, end: 720 },
        ],
      },
    });
    expect(dupSameStaff).toHaveLength(0);
    // シフト未登録の日は人手フィルタをかけない（staff_free=null）
    const unknown = proposeCandidates({ ...base, staffShiftsByDate: {} });
    expect(unknown).toHaveLength(1);
    expect(unknown[0].staff_free).toBeNull();
    // シフト行はあるが在籍0（空配列）の日は「判定対象・在籍0」として除外する
    const zeroActive = proposeCandidates({ ...base, staffShiftsByDate: { "2026-07-13": [] } });
    expect(zeroActive).toHaveLength(0);
  });

  it("checks staffing against the actual work duration, not the whole slot", () => {
    // 09:00-12:00 枠、60分作業。スタッフは 09:00-10:00 のみ在籍。
    const slots = [{ day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00", max_bookings: 1 }];
    const r = proposeCandidates({
      dates: ["2026-07-13"],
      slots,
      closedDays: [],
      reservations: [],
      estimatedMinutes: 60,
      considerStaff: true,
      staffShiftsByDate: { "2026-07-13": [{ staffId: "a", start: 540, end: 600 }] },
    });
    // 実作業は 09:00-10:00 なので在籍が付く → 提案される
    expect(r).toHaveLength(1);
    expect(r[0].end_time).toBe("10:00");
    expect(r[0].staff_free).toBe(1);
  });

  it("counts staff conflicts only within the proposed work window", () => {
    // 09:00-12:00 枠(定員2)。既存予約 10:00-12:00。60分作業を 09:00 に。スタッフ 09:00-10:00。
    const slots = [{ day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00", max_bookings: 2 }];
    const r = proposeCandidates({
      dates: ["2026-07-13"],
      slots,
      closedDays: [],
      reservations: [{ scheduled_date: "2026-07-13", start_time: "10:00:00", end_time: "12:00:00" }],
      estimatedMinutes: 60,
      considerStaff: true,
      staffShiftsByDate: { "2026-07-13": [{ staffId: "a", start: 540, end: 600 }] },
    });
    // 実作業 09:00-10:00 は既存予約(10-12)と重ならない → 人手が付き提案される
    expect(r).toHaveLength(1);
    expect(r[0].end_time).toBe("10:00");
    expect(r[0].staff_free).toBe(1);
  });

  it("excludes restricted slots when category is unknown and excludeRestricted is set", () => {
    const slots = [
      { day_of_week: 1, start_time: "09:00:00", end_time: "10:00:00", max_bookings: 1, accepted_categories: ["洗車"] },
      { day_of_week: 1, start_time: "10:00:00", end_time: "11:00:00", max_bookings: 1, accepted_categories: null },
    ];
    const base = { dates: ["2026-07-13"], slots, closedDays: [], reservations: [], estimatedMinutes: null };
    // カテゴリ不明 + excludeRestricted → 制限枠(洗車のみ)を除外、無制限枠のみ
    const strict = proposeCandidates({ ...base, excludeRestricted: true });
    expect(strict.map((x) => x.start_time)).toEqual(["10:00"]);
    // 既定（excludeRestricted 無し）は従来どおり両方
    const loose = proposeCandidates({ ...base });
    expect(loose).toHaveLength(2);
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

  it("treats an all-day reservation as occupying every slot that day", () => {
    // 月曜に終日予約(時刻 null, all_day)。同日の全枠が満席になり候補から消える。
    const c = proposeCandidates({
      dates: ["2026-07-13", "2026-07-14"],
      slots: SLOTS,
      closedDays: [],
      reservations: [{ scheduled_date: "2026-07-13", start_time: null, end_time: null, all_day: true }],
      estimatedMinutes: null,
    });
    // 定員2の午後枠も終日予約で 1 消費 → 残1 で候補に残る、定員1の枠は満席
    expect(c.map((x) => `${x.date} ${x.start_time}`)).toEqual([
      "2026-07-13 13:00", // 定員2 − 終日1 = 残1
      "2026-07-14 09:00", // 別日は影響なし
    ]);
    expect(c[0].remaining).toBe(1);
  });

  it("ignores non-all-day reservations that have no times (avoids null crash)", () => {
    // 時刻未設定かつ非終日の行は占有に数えない（かつ timeToMinutes(null) で落ちない）。
    const c = proposeCandidates({
      dates: ["2026-07-13"],
      slots: SLOTS,
      closedDays: [],
      reservations: [{ scheduled_date: "2026-07-13", start_time: null, end_time: null, all_day: false }],
      estimatedMinutes: null,
    });
    expect(c.map((x) => x.start_time)).toEqual(["09:00", "13:00"]);
  });
});

describe("computeFreeLoanersByDate", () => {
  const ACTIVE = ["car-a", "car-b"]; // 稼働代車2台

  it("subtracts reservation assignments and open loans, and ignores stale/unknown ids", () => {
    const free = computeFreeLoanersByDate(
      ["2026-07-13", "2026-07-14", "2026-07-15"],
      ACTIVE,
      [
        { scheduled_date: "2026-07-13", loaner_car_id: "car-a" }, // 13日に car-a 割当
        { scheduled_date: "2026-07-13", loaner_car_id: null }, // 代車なしは無視
        { scheduled_date: "2026-07-14", loaner_car_id: "car-x" }, // 稼働外IDは無視
      ],
      [
        // car-b を返却予定 07-14 まで貸出中 → 13,14 は塞がる、15 で空く。
        { loaner_car_id: "car-b", return_due_at: "2026-07-14" },
      ],
    );
    expect(free).toEqual({
      "2026-07-13": 0, // car-a(予約) + car-b(貸出) = 2台とも塞がり残0
      "2026-07-14": 1, // car-b(貸出)のみ → 残1
      "2026-07-15": 2, // すべて空き
    });
  });

  it("treats a null return_due_at as an open-ended loan (occupies every date)", () => {
    const free = computeFreeLoanersByDate(
      ["2026-07-13", "2026-08-01"],
      ACTIVE,
      [],
      [{ loaner_car_id: "car-a", return_due_at: null }],
    );
    expect(free).toEqual({ "2026-07-13": 1, "2026-08-01": 1 });
  });
});
