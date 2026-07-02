import { describe, expect, it } from "vitest";
import {
  daysUntilDate,
  toneForDays,
  channelFor,
  sortTouches,
  summarizeTouches,
  type TouchItem,
} from "@/lib/admin/nextTouch";

const today = new Date("2026-06-30T08:00:00Z");

describe("daysUntilDate", () => {
  it("computes whole-day diffs from a YYYY-MM-DD string", () => {
    expect(daysUntilDate("2026-06-30", today)).toBe(0);
    expect(daysUntilDate("2026-07-10", today)).toBe(10);
    expect(daysUntilDate("2026-06-20", today)).toBe(-10);
  });
  it("accepts a full timestamp and uses only the date part", () => {
    expect(daysUntilDate("2026-07-10T23:59:00+09:00", today)).toBe(10);
  });
  it("returns null for malformed input", () => {
    expect(daysUntilDate(null, today)).toBeNull();
    expect(daysUntilDate("nope", today)).toBeNull();
  });
});

describe("toneForDays", () => {
  it("maps negative→overdue, 0→today, positive→soon", () => {
    expect(toneForDays(-1)).toBe("overdue");
    expect(toneForDays(0)).toBe("today");
    expect(toneForDays(5)).toBe("soon");
  });
});

describe("channelFor", () => {
  it("prefers line, then email, then phone", () => {
    expect(channelFor({ line_user_id: "U", email: "e", phone: "p" })).toBe("line");
    expect(channelFor({ email: "e", phone: "p" })).toBe("email");
    expect(channelFor({ phone: "p" })).toBe("phone");
    expect(channelFor({})).toBe("none");
  });
});

function item(over: Partial<TouchItem>): TouchItem {
  return {
    id: "x",
    customer_id: "c",
    customer_name: "name",
    reason: "service",
    title: "t",
    detail: null,
    due_date: null,
    days_until: 0,
    tone: "today",
    channel: "none",
    ...over,
  };
}

describe("sortTouches", () => {
  it("orders overdue → today → soon, then by days_until", () => {
    const out = sortTouches([
      item({ id: "soon5", tone: "soon", days_until: 5 }),
      item({ id: "today", tone: "today", days_until: 0 }),
      item({ id: "over3", tone: "overdue", days_until: -3 }),
      item({ id: "over10", tone: "overdue", days_until: -10 }),
      item({ id: "soon1", tone: "soon", days_until: 1 }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["over10", "over3", "today", "soon1", "soon5"]);
  });
});

describe("summarizeTouches", () => {
  it("counts by tone and reachability", () => {
    const s = summarizeTouches([
      item({ tone: "overdue", channel: "line" }),
      item({ tone: "today", channel: "email" }),
      item({ tone: "soon", channel: "none" }),
      item({ tone: "soon", channel: "phone" }),
    ]);
    expect(s).toEqual({ total: 4, overdue: 1, today: 1, soon: 2, reachable: 3 });
  });
});
