import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { generateChurnInsight } from "@/lib/ai/churnPrediction";

describe("generateChurnInsight fail-open", () => {
  const original = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("returns null when ANTHROPIC_API_KEY is not set (no AI call attempted)", async () => {
    const result = await generateChurnInsight(
      { name: "テスト顧客" },
      { visit_count: 3, days_since_last_visit: 400, avg_visit_interval_days: 90, risk: "high" },
    );
    expect(result).toBeNull();
  });
});
