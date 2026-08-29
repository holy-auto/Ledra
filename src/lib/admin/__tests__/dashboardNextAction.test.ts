import { describe, it, expect } from "vitest";
import { deriveTodayTasks } from "../todayTasks";
import { TONE_TO_SEVERITY } from "@/app/admin/NextActionSection";

/**
 * IMP-021: ダッシュボード NEXT ACTION の導出テスト。
 *
 * NextActionSection は tilesFromSignals の先頭タイルを NEXT ACTION として表示する。
 * ここでは deriveTodayTasks の優先度順序が NextActionCard のセマンティクスに
 * 正しく対応することを検証する。TONE_TO_SEVERITY は NextActionSection の実物を
 * 使う（コピーを持つと本体の変更をテストが追えなくなる）。
 */

describe("NEXT ACTION 導出", () => {
  // 深夜0時UTC（JST 09:00）は境界値でTZに弱い（todayTasks.test.ts と同じ理由で
  // 正午UTCを使う）。JST 21:00 = UTC 12:00。
  const now = new Date("2025-06-15T21:00:00+09:00");
  const today = "2025-06-15";

  it("作業中案件がある場合、それが最優先", () => {
    const tiles = deriveTodayTasks({
      reservations: [
        { id: "r1", status: "in_progress", scheduled_date: today },
        { id: "r2", status: "confirmed", scheduled_date: today },
      ],
      invoices: [],
      certificates: [],
      now,
    });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].id).toBe("in_progress_jobs");
    expect(TONE_TO_SEVERITY[tiles[0].tone]).toBe("CRITICAL");
  });

  it("期限超過請求は urgent トーン", () => {
    const tiles = deriveTodayTasks({
      reservations: [],
      invoices: [{ id: "inv1", status: "overdue", total: 50000, due_date: "2025-06-10" }],
      certificates: [],
      now,
    });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].id).toBe("overdue_invoices");
    expect(tiles[0].tone).toBe("urgent");
  });

  it("タスクゼロの場合はタイル空配列（NEXT ACTION セクション非表示）", () => {
    const tiles = deriveTodayTasks({
      reservations: [],
      invoices: [],
      certificates: [],
      now,
    });
    expect(tiles).toEqual([]);
  });

  it("今日の来店予約のみの場合は normal トーン", () => {
    const tiles = deriveTodayTasks({
      reservations: [
        { id: "r1", status: "confirmed", scheduled_date: today },
        { id: "r2", status: "confirmed", scheduled_date: today },
      ],
      invoices: [],
      certificates: [],
      now,
    });
    expect(tiles.length).toBe(1);
    expect(tiles[0].id).toBe("today_visits");
    expect(tiles[0].tone).toBe("normal");
    expect(tiles[0].count).toBe(2);
  });

  it("urgentタイルは常にwarn/normalより先にソートされる", () => {
    const tiles = deriveTodayTasks({
      reservations: [
        { id: "r1", status: "confirmed", scheduled_date: today },
        { id: "r2", status: "in_progress", scheduled_date: today },
      ],
      invoices: [{ id: "inv1", status: "sent", total: 10000, due_date: "2025-07-01" }],
      certificates: [],
      now,
    });
    // in_progress_jobs (urgent, priority 0) should be first
    expect(tiles[0].id).toBe("in_progress_jobs");
    // today_visits (normal, priority 1) should be after
    const visitIdx = tiles.findIndex((t) => t.id === "today_visits");
    expect(visitIdx).toBeGreaterThan(0);
  });
});
