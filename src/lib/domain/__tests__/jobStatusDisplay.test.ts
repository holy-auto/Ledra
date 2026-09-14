import { describe, test, expect } from "vitest";
import {
  RESERVATION_STATUS_DISPLAY,
  RESERVATION_STATUS_FLOW,
  LIVE_RESERVATION_STATUSES,
  reservationStatusDisplay,
  type ReservationStatus,
} from "../jobStatusDisplay";

describe("RESERVATION_STATUS_DISPLAY", () => {
  const ALL_STATUSES: ReservationStatus[] = ["confirmed", "arrived", "in_progress", "completed", "cancelled"];

  test("全 5 値に label / hint / bg / text / dot / variant がある", () => {
    for (const s of ALL_STATUSES) {
      const d = RESERVATION_STATUS_DISPLAY[s];
      expect(d.label).toBeTruthy();
      expect(d.hint).toBeTruthy();
      expect(d.bg).toBeTruthy();
      expect(d.text).toBeTruthy();
      expect(d.dot).toBeTruthy();
      expect(d.variant).toBeTruthy();
    }
  });

  test("label が空文字でない", () => {
    for (const s of ALL_STATUSES) {
      expect(RESERVATION_STATUS_DISPLAY[s].label.length).toBeGreaterThan(0);
    }
  });
});

describe("RESERVATION_STATUS_FLOW", () => {
  test("4 ステップの正しい順序", () => {
    expect(RESERVATION_STATUS_FLOW).toEqual(["confirmed", "arrived", "in_progress", "completed"]);
  });

  test("cancelled を含まない", () => {
    expect(RESERVATION_STATUS_FLOW).not.toContain("cancelled");
  });
});

describe("LIVE_RESERVATION_STATUSES", () => {
  test("DB CHECK 制約が許可する5値ちょうど（IMP-031の例外3値は含まない）", () => {
    expect(LIVE_RESERVATION_STATUSES).toEqual(["confirmed", "arrived", "in_progress", "completed", "cancelled"]);
  });

  test("paused/no_show/partially_completed を含まない（未マイグレーション。含めるとフィルタが常に0件になる）", () => {
    expect(LIVE_RESERVATION_STATUSES).not.toContain("paused");
    expect(LIVE_RESERVATION_STATUSES).not.toContain("no_show");
    expect(LIVE_RESERVATION_STATUSES).not.toContain("partially_completed");
  });

  test("全値が RESERVATION_STATUS_DISPLAY に存在する（タイポ防止）", () => {
    for (const s of LIVE_RESERVATION_STATUSES) {
      expect(RESERVATION_STATUS_DISPLAY[s]).toBeDefined();
    }
  });
});

describe("reservationStatusDisplay", () => {
  test("既知のステータスはそのまま返す", () => {
    expect(reservationStatusDisplay("confirmed").label).toBe("予約確定");
    expect(reservationStatusDisplay("completed").variant).toBe("success");
  });

  test("in_progress は violet variant", () => {
    expect(reservationStatusDisplay("in_progress").variant).toBe("violet");
  });

  test("未知のステータスにフォールバックを返す", () => {
    const d = reservationStatusDisplay("unknown_status");
    expect(d.label).toBe("unknown_status");
    expect(d.variant).toBe("default");
    expect(d.bg).toBe("bg-inset");
  });
});
