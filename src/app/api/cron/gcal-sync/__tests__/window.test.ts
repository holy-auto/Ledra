import { describe, it, expect } from "vitest";
import { computeSyncWindow } from "../window";

describe("computeSyncWindow", () => {
  it("returns a JST YYYY-MM-DD window spanning past→future days", () => {
    // 2026-07-21T00:00:00Z は JST 09:00 → 暦日 2026-07-21。
    const w = computeSyncWindow(new Date("2026-07-21T00:00:00Z"), 7, 60);
    expect(w.from).toBe("2026-07-14"); // 21 - 7
    expect(w.to).toBe("2026-09-19"); // 7/21 +10=7/31, +31=8/31, +19=9/19
  });

  it("rolls the JST calendar day forward for late-UTC times (TZ boundary)", () => {
    // 2026-07-20T15:30:00Z は JST 翌 00:30 → 暦日は 2026-07-21（UTC日付ではなく JST 日付で切る）。
    const w = computeSyncWindow(new Date("2026-07-20T15:30:00Z"), 0, 0);
    expect(w.from).toBe("2026-07-21");
    expect(w.to).toBe("2026-07-21");
  });

  it("uses default window of -7..+60 days", () => {
    const w = computeSyncWindow(new Date("2026-01-01T03:00:00Z")); // JST 12:00 2026-01-01
    expect(w.from).toBe("2025-12-25");
    expect(w.to).toBe("2026-03-02"); // 1/1 + 60
  });
});
