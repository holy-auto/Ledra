import { describe, it, expect } from "vitest";
import {
  parseTimeToHours,
  deriveKind,
  deriveProgress,
  capacityOf,
  buildGanttData,
  type ReservationRow,
  type RosterMember,
  type GanttCase,
} from "../board";

describe("parseTimeToHours", () => {
  it("parses HH:MM:SS to fractional hours", () => {
    expect(parseTimeToHours("09:30:00")).toBe(9.5);
    expect(parseTimeToHours("08:00")).toBe(8);
  });
  it("returns null for missing/invalid", () => {
    expect(parseTimeToHours(null)).toBeNull();
    expect(parseTimeToHours("nope")).toBeNull();
  });
});

describe("deriveKind", () => {
  it("maps domain keywords from title", () => {
    expect(deriveKind("検収 → 証明書")).toBe("cert");
    expect(deriveKind("損保 板金 1/3")).toBe("insure");
    expect(deriveKind("部品待ち")).toBe("parts");
    expect(deriveKind("PPF 施工")).toBe("work");
  });
});

describe("deriveProgress", () => {
  it("prefers explicit progress_pct", () => {
    expect(deriveProgress(75)).toBe(75);
    expect(deriveProgress(150)).toBe(100);
  });
  it("falls back to status", () => {
    expect(deriveProgress(null, "completed")).toBe(100);
    expect(deriveProgress(null, "in_progress")).toBe(50);
    expect(deriveProgress(undefined, "confirmed")).toBe(0);
  });
});

describe("capacityOf", () => {
  it("sums assigned hours over the 11h shift", () => {
    const cases: GanttCase[] = [
      { id: "a", label: "", sub: "", kind: "work", tag: "", start: 9, end: 12, prog: 0, staffIds: ["u1"] },
      { id: "b", label: "", sub: "", kind: "work", tag: "", start: 13, end: 14, prog: 0, staffIds: ["u1"] },
    ];
    // 4h / 11h ≈ 36%
    expect(capacityOf("u1", cases)).toBe(36);
    expect(capacityOf("u2", cases)).toBe(0);
  });
});

describe("buildGanttData", () => {
  const roster: RosterMember[] = [
    { user_id: "u1", name: "山田 太郎", sub: "スタッフ" },
    { user_id: "u2", name: "佐藤 花子", sub: "スタッフ" },
  ];
  const base: ReservationRow = {
    id: "r1",
    title: "PPF 施工",
    scheduled_date: "2026-06-20",
    start_time: "09:00:00",
    end_time: "11:00:00",
    assigned_user_id: "u1",
    status: "in_progress",
    progress_pct: 40,
    customer_name: "渡辺 様",
    vehicle_label: "Porsche Taycan",
  };

  it("places assigned + timed reservations as cases", () => {
    const out = buildGanttData([base], roster, "2026-06-20");
    expect(out.cases).toHaveLength(1);
    expect(out.cases[0]).toMatchObject({ start: 9, end: 11, prog: 40, label: "Porsche Taycan", staffIds: ["u1"] });
    expect(out.unassigned).toHaveLength(0);
  });

  it("routes unassigned / untimed reservations to the unassigned column", () => {
    const noStaff: ReservationRow = { ...base, id: "r2", assigned_user_id: null };
    const noTime: ReservationRow = { ...base, id: "r3", start_time: null };
    const out = buildGanttData([noStaff, noTime], roster, "2026-06-20");
    expect(out.cases).toHaveLength(0);
    expect(out.unassigned.map((u) => u.id).sort()).toEqual(["r2", "r3"]);
  });

  it("excludes cancelled reservations", () => {
    const cancelled: ReservationRow = { ...base, id: "r4", status: "cancelled" };
    const out = buildGanttData([cancelled], roster, "2026-06-20");
    expect(out.cases).toHaveLength(0);
    expect(out.unassigned).toHaveLength(0);
  });

  it("defaults end to start+1h when end is missing/invalid", () => {
    const noEnd: ReservationRow = { ...base, end_time: null };
    const out = buildGanttData([noEnd], roster, "2026-06-20");
    expect(out.cases[0]).toMatchObject({ start: 9, end: 10 });
  });
});
