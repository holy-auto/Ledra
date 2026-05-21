import { describe, it, expect } from "vitest";
import { formatWorkDuration, computeWorkDurationText } from "@/lib/admin/work-duration";

describe("formatWorkDuration", () => {
  it("formats sub-hour durations as '<m>分'", () => {
    expect(formatWorkDuration(0)).toBe("0分");
    expect(formatWorkDuration(60_000)).toBe("1分");
    expect(formatWorkDuration(29 * 60_000)).toBe("29分");
    expect(formatWorkDuration(59 * 60_000)).toBe("59分");
  });

  it("formats hour-plus durations as '<h>時間<m>分'", () => {
    expect(formatWorkDuration(60 * 60_000)).toBe("1時間0分");
    expect(formatWorkDuration(90 * 60_000)).toBe("1時間30分");
    expect(formatWorkDuration(125 * 60_000)).toBe("2時間5分");
  });

  it("clamps negative and non-finite values to 0 minutes", () => {
    expect(formatWorkDuration(-100)).toBe("0分");
    expect(formatWorkDuration(Number.NaN)).toBe("0分");
    expect(formatWorkDuration(Infinity)).toBe("0分");
  });

  it("truncates seconds (floor to minute)", () => {
    expect(formatWorkDuration(59_999)).toBe("0分");
    expect(formatWorkDuration(60_001)).toBe("1分");
  });
});

describe("computeWorkDurationText", () => {
  const T0 = "2026-05-20T09:00:00.000Z";
  const T_PLUS_45M = "2026-05-20T09:45:00.000Z";
  const T_PLUS_90M = "2026-05-20T10:30:00.000Z";

  it("returns null when no work_started_at", () => {
    expect(
      computeWorkDurationText({
        workStartedAt: null,
        workCompletedAt: null,
        isInProgress: false,
      }),
    ).toBeNull();
  });

  it("returns null when started_at is unparseable", () => {
    expect(
      computeWorkDurationText({
        workStartedAt: "not-a-date",
        workCompletedAt: null,
        isInProgress: true,
        now: Date.parse(T_PLUS_45M),
      }),
    ).toBeNull();
  });

  it("uses workCompletedAt when present (completed jobs)", () => {
    expect(
      computeWorkDurationText({
        workStartedAt: T0,
        workCompletedAt: T_PLUS_90M,
        isInProgress: false,
        now: Date.parse("2026-06-01T00:00:00Z"), // ignored
      }),
    ).toBe("1時間30分");
  });

  it("uses `now` when in_progress and no completion time yet", () => {
    expect(
      computeWorkDurationText({
        workStartedAt: T0,
        workCompletedAt: null,
        isInProgress: true,
        now: Date.parse(T_PLUS_45M),
      }),
    ).toBe("45分");
  });

  it("returns null when not in_progress and no completion time", () => {
    expect(
      computeWorkDurationText({
        workStartedAt: T0,
        workCompletedAt: null,
        isInProgress: false,
        now: Date.parse(T_PLUS_45M),
      }),
    ).toBeNull();
  });
});
