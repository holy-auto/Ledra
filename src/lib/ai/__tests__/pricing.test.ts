import { describe, it, expect } from "vitest";
import { pricingForModel, estimateCostUsd, estimateCostJpy } from "../pricing";

describe("pricingForModel", () => {
  it("resolves model families by prefix (incl. versioned ids)", () => {
    expect(pricingForModel("claude-opus-4-8").input).toBe(15);
    expect(pricingForModel("claude-opus-4-8-20260101").output).toBe(75);
    expect(pricingForModel("claude-sonnet-4-6").input).toBe(3);
    expect(pricingForModel("claude-haiku-4-5").input).toBe(1);
  });

  it("falls back to Sonnet-equivalent pricing for unknown / null models", () => {
    expect(pricingForModel("gpt-something").input).toBe(3);
    expect(pricingForModel(null).input).toBe(3);
    expect(pricingForModel(undefined).output).toBe(15);
  });
});

describe("estimateCostUsd", () => {
  it("computes input + output cost in USD", () => {
    // Sonnet: 1M input ($3) + 1M output ($15) = $18
    expect(estimateCostUsd("claude-sonnet-4-6", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(
      18,
      6,
    );
    // Haiku: 2000 in ($0.002) + 500 out ($0.0025) = $0.0045
    expect(estimateCostUsd("claude-haiku-4-5", { inputTokens: 2000, outputTokens: 500 })).toBeCloseTo(0.0045, 9);
  });

  it("treats missing token counts as zero", () => {
    expect(estimateCostUsd("claude-sonnet-4-6", {})).toBe(0);
    expect(estimateCostUsd("claude-sonnet-4-6", { inputTokens: null, outputTokens: null })).toBe(0);
  });

  it("prices cache read tokens far below normal input", () => {
    const full = estimateCostUsd("claude-sonnet-4-6", { inputTokens: 1_000_000 });
    const cached = estimateCostUsd("claude-sonnet-4-6", { cacheReadTokens: 1_000_000 });
    expect(cached).toBeLessThan(full);
    expect(cached).toBeCloseTo(0.3, 6); // 0.1x of $3
  });
});

describe("estimateCostJpy", () => {
  it("applies the provided USD/JPY rate", () => {
    // $18 * 150 = ¥2700
    expect(estimateCostJpy("claude-sonnet-4-6", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, 150)).toBeCloseTo(
      2700,
      3,
    );
  });
});
