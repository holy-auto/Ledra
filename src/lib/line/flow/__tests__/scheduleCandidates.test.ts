import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({ store: null as unknown as FakeStore }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));

import { fetchFlowScheduleCandidates, reservationDurationMinutes } from "../scheduleCandidates";

const TENANT = "11111111-1111-1111-1111-111111111111";
// 2026-09-10 は木曜 (day_of_week=4)。restrictToDate でこの 1 日だけを評価する。
const DATE = "2026-09-10";
const DOW = 4;

// 09:00-10:00 (60分) の枠、定員2。
function seedSlot(over: Record<string, unknown> = {}) {
  mocks.store.tables.external_booking_slots = [
    {
      tenant_id: TENANT,
      is_active: true,
      day_of_week: DOW,
      start_time: "09:00:00",
      end_time: "10:00:00",
      max_bookings: 2,
      accepted_categories: null,
      ...over,
    },
  ];
}

beforeEach(() => {
  mocks.store = emptyStore({
    external_booking_slots: [],
    closed_days: [],
    reservations: [],
    loaner_cars: [],
    loaner_car_loans: [],
  });
});

describe("reservationDurationMinutes", () => {
  it("returns the gap in minutes when both times are present and end>start", () => {
    expect(reservationDurationMinutes("10:00:00", "12:00:00")).toBe(120);
  });
  it("returns null for all-day/missing/reversed", () => {
    expect(reservationDurationMinutes(null, "12:00:00")).toBeNull();
    expect(reservationDurationMinutes("10:00:00", null)).toBeNull();
    expect(reservationDurationMinutes("12:00:00", "10:00:00")).toBeNull();
  });
});

describe("fetchFlowScheduleCandidates", () => {
  it("drops slots too short for the estimated duration, keeps fitting ones", async () => {
    seedSlot(); // 60 分枠
    const admin = makeFakeAdmin(mocks.store);

    // 120 分の作業は 60 分枠に入らない → 候補なし。
    const tooLong = await fetchFlowScheduleCandidates(admin, TENANT, { restrictToDate: DATE, estimatedMinutes: 120 });
    expect(tooLong).toEqual([]);

    // 30 分の作業は入る。end_time は所要時間ぶん (09:30) に揃う (枠終了ではない)。
    const fits = await fetchFlowScheduleCandidates(admin, TENANT, { restrictToDate: DATE, estimatedMinutes: 30 });
    expect(fits).toEqual([{ date: DATE, start_time: "09:00", end_time: "09:30" }]);
  });

  it("does not let too-short slots starve the limit budget (fitting slot still surfaces)", async () => {
    // 同日に短い枠3つ (先頭) と入る枠1つ。limit=1 でも入る枠が取りこぼされないこと
    // (fits=false が limit を食い潰さない = onlyFitting が push 前に効く)。
    mocks.store.tables.external_booking_slots = [
      {
        tenant_id: TENANT,
        is_active: true,
        day_of_week: DOW,
        start_time: "09:00:00",
        end_time: "09:30:00",
        max_bookings: 1,
        accepted_categories: null,
      },
      {
        tenant_id: TENANT,
        is_active: true,
        day_of_week: DOW,
        start_time: "10:00:00",
        end_time: "10:30:00",
        max_bookings: 1,
        accepted_categories: null,
      },
      {
        tenant_id: TENANT,
        is_active: true,
        day_of_week: DOW,
        start_time: "11:00:00",
        end_time: "11:30:00",
        max_bookings: 1,
        accepted_categories: null,
      },
      {
        tenant_id: TENANT,
        is_active: true,
        day_of_week: DOW,
        start_time: "13:00:00",
        end_time: "15:00:00",
        max_bookings: 1,
        accepted_categories: null,
      },
    ];
    const admin = makeFakeAdmin(mocks.store);
    const c = await fetchFlowScheduleCandidates(admin, TENANT, {
      restrictToDate: DATE,
      estimatedMinutes: 120,
      limit: 1,
    });
    expect(c).toEqual([{ date: DATE, start_time: "13:00", end_time: "15:00" }]);
  });

  it("gates on loaner availability only when needsLoaner is set", async () => {
    seedSlot();
    // 稼働代車1台。同日 14:00-15:00 の別予約がその代車を押さえている (枠とは重ならない)。
    mocks.store.tables.loaner_cars = [{ tenant_id: TENANT, is_active: true, id: "car-1" }];
    mocks.store.tables.reservations = [
      {
        tenant_id: TENANT,
        scheduled_date: DATE,
        start_time: "14:00:00",
        end_time: "15:00:00",
        all_day: false,
        loaner_car_id: "car-1",
      },
    ];
    const admin = makeFakeAdmin(mocks.store);

    // 代車不要なら 09:00 枠は空き (別予約は時間帯が重ならない) → 候補あり。
    const noLoaner = await fetchFlowScheduleCandidates(admin, TENANT, { restrictToDate: DATE });
    expect(noLoaner.map((c) => c.start_time)).toEqual(["09:00"]);

    // 代車必須だとその日は空き代車0 (唯一の車が別予約で塞がり) → 候補なし。
    const needLoaner = await fetchFlowScheduleCandidates(admin, TENANT, { restrictToDate: DATE, needsLoaner: true });
    expect(needLoaner).toEqual([]);
  });

  it("excludes category-restricted slots when excludeRestricted is set", async () => {
    seedSlot({ accepted_categories: ["車検"] }); // 車検専用枠
    const admin = makeFakeAdmin(mocks.store);

    const withRestricted = await fetchFlowScheduleCandidates(admin, TENANT, { restrictToDate: DATE });
    expect(withRestricted.map((c) => c.start_time)).toEqual(["09:00"]);

    const excluded = await fetchFlowScheduleCandidates(admin, TENANT, {
      restrictToDate: DATE,
      excludeRestricted: true,
    });
    expect(excluded).toEqual([]);
  });
});
