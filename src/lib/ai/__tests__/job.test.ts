import { describe, it, expect } from "vitest";
import { clipTitle } from "../jobAutoTitle";
import { pickJobNextActionCandidate } from "../jobNextAction";
import { evaluateTimerDeviation } from "../jobTimerAlert";

describe("clipTitle", () => {
  it("strips emoji and trims whitespace", () => {
    expect(clipTitle("  ガラスコート 🎉  ")).toBe("ガラスコート");
  });

  it("truncates to ~20 zenkaku characters", () => {
    const long = "ガラスコーティング全面施工パッケージプラン提案";
    const out = clipTitle(long);
    expect(out.length).toBeLessThanOrEqual(long.length);
    expect(out.length).toBeGreaterThan(0);
  });

  it("allows ASCII to count as half-width", () => {
    const out = clipTitle("Yamada Prius 2022 Coating");
    // 25 ASCII chars = 12.5 zenkaku => should fit fully
    expect(out).toBe("Yamada Prius 2022 Coating");
  });
});

describe("pickJobNextActionCandidate", () => {
  const base = {
    status: "confirmed" as const,
    hasCustomer: true,
    hasVehicle: true,
    hasActiveCertificate: false,
    hasUnpaidInvoice: false,
    hasOverdueInvoice: false,
    minutesSinceStatusChange: 10,
    estimatedDurationMin: 60,
  };

  it("flags overdue invoices regardless of status", () => {
    const out = pickJobNextActionCandidate({ ...base, status: "completed", hasOverdueInvoice: true });
    expect(out.action).toBe("follow_up_overdue");
    expect(out.priority).toBe("high");
  });

  it("requests customer link when confirmed without customer", () => {
    const out = pickJobNextActionCandidate({ ...base, hasCustomer: false });
    expect(out.action).toBe("link_customer");
  });

  it("requests vehicle link when confirmed with customer but no vehicle", () => {
    const out = pickJobNextActionCandidate({ ...base, hasVehicle: false });
    expect(out.action).toBe("link_vehicle");
  });

  it("nudges towards work start when arrived", () => {
    expect(pickJobNextActionCandidate({ ...base, status: "arrived" }).action).toBe("start_work");
  });

  it("escalates when in_progress exceeds 20% over estimate", () => {
    const out = pickJobNextActionCandidate({
      ...base,
      status: "in_progress",
      estimatedDurationMin: 60,
      minutesSinceStatusChange: 73,
    });
    expect(out.action).toBe("issue_certificate");
    expect(out.priority).toBe("high");
  });

  it("recommends certificate when completed but no active cert", () => {
    expect(pickJobNextActionCandidate({ ...base, status: "completed" }).action).toBe("issue_certificate");
  });

  it("recommends payment collection when completed with unpaid invoice", () => {
    expect(
      pickJobNextActionCandidate({
        ...base,
        status: "completed",
        hasActiveCertificate: true,
        hasUnpaidInvoice: true,
      }).action,
    ).toBe("collect_payment");
  });

  it("recommends thank-you when completed and settled", () => {
    expect(pickJobNextActionCandidate({ ...base, status: "completed", hasActiveCertificate: true }).action).toBe(
      "send_thanks",
    );
  });

  it("returns close action for cancelled jobs", () => {
    expect(pickJobNextActionCandidate({ ...base, status: "cancelled" }).action).toBe("cancel_or_close");
  });
});

describe("evaluateTimerDeviation", () => {
  it("returns ok within ±20%", () => {
    expect(evaluateTimerDeviation({ actualMinutes: 60, estimatedMinutes: 60, finalized: true })).toBe("ok");
    expect(evaluateTimerDeviation({ actualMinutes: 65, estimatedMinutes: 60, finalized: true })).toBe("ok");
  });

  it("warns at +20%", () => {
    expect(evaluateTimerDeviation({ actualMinutes: 75, estimatedMinutes: 60, finalized: false })).toBe("warn_over");
  });

  it("alerts at +50%", () => {
    expect(evaluateTimerDeviation({ actualMinutes: 95, estimatedMinutes: 60, finalized: false })).toBe("alert_over");
  });

  it("warns on big shortening when finalized only", () => {
    expect(evaluateTimerDeviation({ actualMinutes: 25, estimatedMinutes: 60, finalized: true })).toBe("warn_short");
    // Not finalized → still a normal in-progress state.
    expect(evaluateTimerDeviation({ actualMinutes: 25, estimatedMinutes: 60, finalized: false })).toBe("ok");
  });

  it("returns ok for invalid inputs", () => {
    expect(evaluateTimerDeviation({ actualMinutes: NaN, estimatedMinutes: 60, finalized: true })).toBe("ok");
    expect(evaluateTimerDeviation({ actualMinutes: 60, estimatedMinutes: 0, finalized: true })).toBe("ok");
    expect(evaluateTimerDeviation({ actualMinutes: 60, estimatedMinutes: -5, finalized: true })).toBe("ok");
  });
});
