// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UnifiedTimeline, {
  mergeUnifiedEvents,
  type CertEvent,
  type HistoryItem,
  type ReservationItem,
} from "../UnifiedTimeline";

const histories: HistoryItem[] = [
  {
    id: "h1",
    type: "issued",
    title: "施工証明書を発行",
    description: "PPF 全面施工",
    performed_at: "2026-04-01T09:00:00.000Z",
    created_at: "2026-04-01T09:00:00.000Z",
  },
  {
    id: "h2",
    type: "void",
    title: "旧証明書を無効化",
    description: null,
    performed_at: "2026-03-20T10:00:00.000Z",
    created_at: "2026-03-20T10:00:00.000Z",
  },
];

const certs: CertEvent[] = [
  // self — should be excluded
  {
    id: "self",
    publicId: "PID-SELF",
    status: "active",
    createdAt: "2026-04-01T09:00:00.000Z",
  },
  {
    id: "other",
    publicId: "PID-OTHER",
    status: "active",
    createdAt: "2026-02-01T08:00:00.000Z",
  },
  {
    id: "voided",
    publicId: "PID-VOID",
    status: "void",
    createdAt: "2026-01-01T07:00:00.000Z",
  },
];

const reservations: ReservationItem[] = [
  {
    id: "r1",
    title: "ガラスコーティング",
    status: "completed",
    scheduled_at: "2026-04-15T10:00:00.000Z",
  },
  {
    id: "r2",
    title: "整備点検",
    status: "in_progress",
    scheduled_at: "2026-04-20T11:00:00.000Z",
  },
];

describe("UnifiedTimeline.mergeUnifiedEvents", () => {
  it("excludes the self certificate from cert events", () => {
    const events = mergeUnifiedEvents({ histories: [], certs, reservations: [], selfPublicId: "PID-SELF" });
    expect(events.find((e) => e.key === "cert-self")).toBeUndefined();
    expect(events.find((e) => e.key === "cert-other")).toBeDefined();
    expect(events.find((e) => e.key === "cert-voided")).toBeDefined();
  });

  it("sorts events by occurredAt descending (newest first) across all sources", () => {
    const events = mergeUnifiedEvents({ histories, certs, reservations, selfPublicId: "PID-SELF" });
    const dates = events.map((e) => e.occurredAt);
    const sorted = [...dates].sort((a, b) => Date.parse(b) - Date.parse(a));
    expect(dates).toEqual(sorted);
  });

  it("uses 'void' variant for invalidated cert events", () => {
    const events = mergeUnifiedEvents({ histories: [], certs, reservations: [], selfPublicId: "PID-SELF" });
    const voided = events.find((e) => e.key === "cert-voided");
    expect(voided?.variant).toBe("void");
    expect(voided?.badge).toContain("無効");
  });

  it("does not expose any customer name in cert event descriptions for public display", () => {
    const events = mergeUnifiedEvents({
      histories: [],
      certs: [
        {
          id: "x",
          publicId: "PID-X",
          status: "active",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      reservations: [],
      selfPublicId: "PID-SELF",
    });
    const ev = events[0];
    expect(ev.description).toBeNull();
  });

  it("includes only reservations with scheduled_at and uses friendly status badges", () => {
    const events = mergeUnifiedEvents({
      histories: [],
      certs: [],
      reservations: [
        { id: "r1", title: "ガラス", status: "completed", scheduled_at: "2026-04-01T10:00:00.000Z" },
        { id: "r2", title: "整備", status: "arrived", scheduled_at: "2026-03-01T10:00:00.000Z" },
        { id: "r3", title: "no time", status: "completed", scheduled_at: null },
      ],
      selfPublicId: "PID-SELF",
    });
    expect(events.length).toBe(2);
    expect(events.find((e) => e.key === "rsv-r1")?.badge).toBe("作業完了");
    expect(events.find((e) => e.key === "rsv-r2")?.badge).toBe("来店");
    expect(events.find((e) => e.key === "rsv-r3")).toBeUndefined();
  });

  it("falls back to 履歴 badge when history type is unrecognised", () => {
    const events = mergeUnifiedEvents({
      histories: [
        {
          id: "h",
          type: "weird-event",
          title: "unknown",
          performed_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      certs: [],
      reservations: [],
      selfPublicId: "PID-SELF",
    });
    expect(events[0].badge).toBe("履歴");
  });

  it("returns an empty list when all inputs are empty", () => {
    expect(mergeUnifiedEvents({ histories: [], certs: [], reservations: [], selfPublicId: "PID-SELF" })).toEqual([]);
  });
});

describe("UnifiedTimeline render", () => {
  it("renders all merged event titles in time-descending order", () => {
    render(<UnifiedTimeline histories={histories} certs={certs} reservations={reservations} selfPublicId="PID-SELF" />);
    expect(screen.getByText("サービス履歴")).toBeDefined();
    expect(screen.getByText("整備点検")).toBeDefined();
    expect(screen.getByText("ガラスコーティング")).toBeDefined();
    expect(screen.getByText("施工証明書を発行")).toBeDefined();
  });

  it("falls back to a 'no history' message when nothing to show", () => {
    render(<UnifiedTimeline histories={[]} certs={[]} reservations={[]} selfPublicId="PID-SELF" />);
    expect(screen.getByText("履歴はありません。")).toBeDefined();
  });
});
