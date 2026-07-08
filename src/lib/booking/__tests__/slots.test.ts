import { describe, it, expect } from "vitest";
import { generateIntervalSlots, minutesToTime, timeToMinutes } from "../slots";

describe("minutesToTime / timeToMinutes", () => {
  it("round-trips HH:MM", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(90)).toBe("01:30");
    expect(minutesToTime(1440)).toBe("24:00");
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("21:30:00")).toBe(1290);
  });
});

describe("generateIntervalSlots", () => {
  it("splits a range into N-minute frames for one day", () => {
    const slots = generateIntervalSlots({ days: [1], startMin: 540, endMin: 660, intervalMin: 30 });
    expect(slots.map((s) => `${s.start_time}-${s.end_time}`)).toEqual([
      "09:00-09:30",
      "09:30-10:00",
      "10:00-10:30",
      "10:30-11:00",
    ]);
    expect(slots.every((s) => s.day_of_week === 1 && s.max_bookings === 1 && s.is_active)).toBe(true);
  });

  it("splits into hourly frames across multiple days", () => {
    const slots = generateIntervalSlots({ days: [1, 3], startMin: 600, endMin: 720, intervalMin: 60, maxBookings: 2 });
    expect(slots).toHaveLength(4); // 2 days × 2 frames
    expect(slots.filter((s) => s.day_of_week === 1)).toHaveLength(2);
    expect(slots.every((s) => s.max_bookings === 2)).toBe(true);
  });

  it("keeps a shorter trailing frame when the range is not divisible", () => {
    // 09:00〜10:30 を 60分毎 → 09:00-10:00 と 10:00-10:30（端数）
    const slots = generateIntervalSlots({ days: [2], startMin: 540, endMin: 630, intervalMin: 60 });
    expect(slots.map((s) => `${s.start_time}-${s.end_time}`)).toEqual(["09:00-10:00", "10:00-10:30"]);
  });

  it("dedupes days and ignores invalid weekday values", () => {
    const slots = generateIntervalSlots({ days: [1, 1, 7, -1], startMin: 540, endMin: 600, intervalMin: 60 });
    expect(slots).toHaveLength(1);
    expect(slots[0].day_of_week).toBe(1);
  });

  it("returns [] on invalid input", () => {
    expect(generateIntervalSlots({ days: [1], startMin: 600, endMin: 540, intervalMin: 30 })).toEqual([]);
    expect(generateIntervalSlots({ days: [1], startMin: 540, endMin: 600, intervalMin: 0 })).toEqual([]);
    expect(generateIntervalSlots({ days: [], startMin: 540, endMin: 600, intervalMin: 30 })).toEqual([]);
  });
});
