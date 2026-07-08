import { describe, it, expect } from "vitest";
import { decomposeTasks } from "../tasks";

describe("decomposeTasks", () => {
  it("keeps tasks on one day when within the daily budget", () => {
    const r = decomposeTasks([
      { name: "洗車", minutes: 60 },
      { name: "コーティング", minutes: 180 },
    ]);
    expect(r.totalMinutes).toBe(240);
    expect(r.dayCount).toBe(1);
    expect(r.tasks.every((t) => t.day === 1)).toBe(true);
  });

  it("splits across days when exceeding the daily budget", () => {
    // 上限 480分。300+300 → 2日目に2つ目。
    const r = decomposeTasks(
      [
        { name: "板金", minutes: 300 },
        { name: "塗装", minutes: 300 },
      ],
      { maxPerDayMinutes: 480 },
    );
    expect(r.dayCount).toBe(2);
    expect(r.tasks.map((t) => t.day)).toEqual([1, 2]);
  });

  it("places an oversize single task on its own day and continues next day", () => {
    const r = decomposeTasks(
      [
        { name: "全塗装", minutes: 600 }, // 上限超過でも単独で載せる
        { name: "仕上げ", minutes: 120 },
      ],
      { maxPerDayMinutes: 480 },
    );
    expect(r.tasks.map((t) => t.day)).toEqual([1, 2]);
    expect(r.dayCount).toBe(2);
  });

  it("ignores items without a positive duration", () => {
    const r = decomposeTasks([
      { name: "点検", minutes: null },
      { name: "洗車", minutes: 60 },
      { name: "無効", minutes: 0 },
    ]);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].name).toBe("洗車");
    expect(r.dayCount).toBe(1);
  });

  it("returns empty for no valid tasks", () => {
    const r = decomposeTasks([{ name: "点検", minutes: null }]);
    expect(r.tasks).toHaveLength(0);
    expect(r.totalMinutes).toBe(0);
    expect(r.dayCount).toBe(0);
  });
});
