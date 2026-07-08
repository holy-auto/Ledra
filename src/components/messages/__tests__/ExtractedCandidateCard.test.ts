import { describe, it, expect } from "vitest";
import { buildReservationPrefillHref, type ExtractedResult } from "@/components/messages/ExtractedCandidateCard";

const base: ExtractedResult = { intent: "new_reservation", confidence: 0.9, ai: true };

describe("buildReservationPrefillHref", () => {
  it("returns null for non-reservation intents", () => {
    expect(buildReservationPrefillHref({ ...base, intent: "inquiry_only" })).toBeNull();
    expect(buildReservationPrefillHref({ ...base, intent: "other" })).toBeNull();
  });

  it("returns null once the candidate is handled", () => {
    expect(buildReservationPrefillHref({ ...base, handled_at: "2026-07-08T00:00:00Z" })).toBeNull();
  });

  it("builds a walk-in prefill with customer, title and a note digest", () => {
    const href = buildReservationPrefillHref(
      {
        ...base,
        service: "ガラスコーティング",
        scheduled_date: "2026-07-09",
        vehicle: "トヨタ プリウス",
        customer_name: "山田太郎",
        phone: "090-1234-5678",
        email: "taro@example.com",
      },
      "cust-1",
    );
    expect(href).not.toBeNull();
    const url = new URL(href!, "https://x.test");
    expect(url.pathname).toBe("/admin/jobs/new");
    expect(url.searchParams.get("customer_id")).toBe("cust-1");
    expect(url.searchParams.get("title")).toBe("ガラスコーティング");
    const note = url.searchParams.get("note") ?? "";
    expect(note).toContain("希望日: 2026-07-09");
    expect(note).toContain("車両: トヨタ プリウス");
    expect(note).toContain("電話: 090-1234-5678");
    expect(note).toContain("メール: taro@example.com");
  });

  it("omits customer_id when unlinked (e.g. email thread with no customer)", () => {
    const href = buildReservationPrefillHref({ ...base, service: "洗車" });
    const url = new URL(href!, "https://x.test");
    expect(url.searchParams.has("customer_id")).toBe(false);
    expect(url.searchParams.get("title")).toBe("洗車");
  });
});
