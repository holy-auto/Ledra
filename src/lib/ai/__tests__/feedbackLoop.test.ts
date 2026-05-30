import { describe, it, expect } from "vitest";
import { recommendAutoActions, type UsageRowLike } from "../automation/feedbackLoop";
import { DEFAULT_AI_AUTOMATION_SETTINGS } from "../automation/policy";

const EXTRACT_ENDPOINT = "/api/admin/customer-messages/[id]/ai-extract";

function rows(n: number, confidence: number, outcome = "ok"): UsageRowLike[] {
  return Array.from({ length: n }, () => ({ endpoint: EXTRACT_ENDPOINT, outcome, confidence }));
}

function findExtract(recs: ReturnType<typeof recommendAutoActions>) {
  return recs.find((r) => r.actionKey === "inbound_message.auto_extract");
}

describe("recommendAutoActions", () => {
  it("ignores endpoints that have no opt-in action (e.g. 壁3 / unmapped)", () => {
    const recs = recommendAutoActions(
      [{ endpoint: "/api/admin/certificates/ai-issue", outcome: "ok", confidence: 0.95 }],
      DEFAULT_AI_AUTOMATION_SETTINGS,
    );
    expect(recs).toEqual([]);
  });

  it("reports insufficient_data below the sample floor", () => {
    const recs = recommendAutoActions(rows(5, 0.95), DEFAULT_AI_AUTOMATION_SETTINGS);
    const r = findExtract(recs);
    expect(r?.kind).toBe("insufficient_data");
    expect(r?.recommendEnable).toBe(false);
  });

  it("recommends enabling auto when sample size + confidence are high", () => {
    const recs = recommendAutoActions(rows(25, 0.9), DEFAULT_AI_AUTOMATION_SETTINGS);
    const r = findExtract(recs);
    expect(r?.kind).toBe("enable_auto");
    expect(r?.recommendEnable).toBe(true);
    expect(r?.avgConfidence).toBe(0.9);
    expect(r?.samples).toBe(25);
  });

  it("flags needs_attention when confidence is below the tenant threshold", () => {
    const recs = recommendAutoActions(rows(25, 0.3), DEFAULT_AI_AUTOMATION_SETTINGS);
    const r = findExtract(recs);
    expect(r?.kind).toBe("needs_attention");
    expect(r?.recommendEnable).toBe(false);
  });

  it("says keep when confidence sits between threshold and promote bar", () => {
    const recs = recommendAutoActions(rows(25, 0.6), DEFAULT_AI_AUTOMATION_SETTINGS);
    const r = findExtract(recs);
    expect(r?.kind).toBe("keep");
  });

  it("reports already_auto when the action is opted in", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      autoActions: { "inbound_message.auto_extract": true },
    };
    const recs = recommendAutoActions(rows(25, 0.9), settings);
    const r = findExtract(recs);
    expect(r?.kind).toBe("already_auto");
    expect(r?.recommendEnable).toBe(false);
  });

  it("sorts enable_auto recommendations first", () => {
    const mixed = [
      ...rows(25, 0.9),
      ...rows(25, 0.3).map((r) => ({ ...r, endpoint: "/api/admin/reviews/ai-sentiment" })),
    ];
    const recs = recommendAutoActions(mixed, DEFAULT_AI_AUTOMATION_SETTINGS);
    expect(recs[0]?.kind).toBe("enable_auto");
  });
});
