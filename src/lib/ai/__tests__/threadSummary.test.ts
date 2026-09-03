import { describe, it, expect } from "vitest";
import { generateThreadSummary } from "../threadSummary";

describe("generateThreadSummary", () => {
  it("returns an empty result when there are no non-empty turns", async () => {
    const r = await generateThreadSummary({ turns: [{ direction: "inbound", body: "   " }] });
    expect(r).toEqual({ summary: "", next_action: "", ai: false });
  });

  it("returns an empty result when there are no turns at all", async () => {
    const r = await generateThreadSummary({ turns: [] });
    expect(r.ai).toBe(false);
    expect(r.summary).toBe("");
  });
});
