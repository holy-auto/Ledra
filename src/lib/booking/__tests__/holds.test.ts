import { describe, it, expect } from "vitest";
import { isHoldActive, mergeHoldsIntoReservations, type HoldLike } from "@/lib/booking/holds";
import { proposeCandidates } from "@/lib/booking/candidates";

/**
 * 仮押さえが空き計算に正しく反映されるかの回帰チェック（DB 非依存）。
 * 有効 hold は残数を1減らし、失効 hold は減らさない。
 */

const DATE = "2026-07-20";
const DOW = new Date(2026, 6, 20).getDay(); // その日の曜日
const NOW = new Date("2026-07-19T00:00:00+09:00");

const slot = {
  day_of_week: DOW,
  start_time: "10:00",
  end_time: "11:00",
  max_bookings: 1,
  accepted_categories: null,
};

function remainingFor(holds: HoldLike[]): number {
  const occupants = mergeHoldsIntoReservations([], holds, NOW);
  const candidates = proposeCandidates({
    dates: [DATE],
    slots: [slot],
    closedDays: [],
    reservations: occupants,
    estimatedMinutes: null,
  });
  const c = candidates.find((x) => x.date === DATE && x.start_time === "10:00");
  return c ? c.remaining : 0; // 候補が消えていれば残0扱い
}

describe("isHoldActive", () => {
  it("pending かつ未失効なら有効", () => {
    expect(
      isHoldActive(
        {
          scheduled_date: DATE,
          start_time: "10:00",
          end_time: "11:00",
          status: "pending",
          expires_at: "2026-07-20T00:00:00+09:00",
        },
        NOW,
      ),
    ).toBe(true);
  });
  it("失効・非pending は無効", () => {
    expect(
      isHoldActive(
        {
          scheduled_date: DATE,
          start_time: "10:00",
          end_time: "11:00",
          status: "pending",
          expires_at: "2026-07-18T00:00:00+09:00",
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isHoldActive(
        {
          scheduled_date: DATE,
          start_time: "10:00",
          end_time: "11:00",
          status: "accepted",
          expires_at: "2026-07-20T00:00:00+09:00",
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("仮押さえの空き反映（max_bookings=1）", () => {
  it("hold 無しなら残1（候補あり）", () => {
    expect(remainingFor([])).toBe(1);
  });
  it("有効 hold が1件で満枠（候補が消える＝残0）", () => {
    expect(
      remainingFor([
        {
          scheduled_date: DATE,
          start_time: "10:00",
          end_time: "11:00",
          status: "pending",
          expires_at: "2026-07-20T12:00:00+09:00",
        },
      ]),
    ).toBe(0);
  });
  it("失効 hold は枠を消費しない（残1）", () => {
    expect(
      remainingFor([
        {
          scheduled_date: DATE,
          start_time: "10:00",
          end_time: "11:00",
          status: "pending",
          expires_at: "2026-07-18T12:00:00+09:00",
        },
      ]),
    ).toBe(1);
  });
  it("時間帯が重ならない hold は影響しない（残1）", () => {
    expect(
      remainingFor([
        {
          scheduled_date: DATE,
          start_time: "11:00",
          end_time: "12:00",
          status: "pending",
          expires_at: "2026-07-20T12:00:00+09:00",
        },
      ]),
    ).toBe(1);
  });
});
