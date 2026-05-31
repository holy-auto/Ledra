import { describe, it, expect } from "vitest";
import { beginAiUsageCapture, addUsageFromMessage, getCapturedUsage } from "../usageContext";

describe("usageContext", () => {
  it("accumulates usage from multiple messages within a capture", () => {
    beginAiUsageCapture();
    addUsageFromMessage({
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50 },
    });
    addUsageFromMessage({
      model: "claude-opus-4-8",
      usage: { input_tokens: 500, output_tokens: 100, cache_creation_input_tokens: 30 },
    });

    const cap = getCapturedUsage();
    expect(cap).toBeDefined();
    expect(cap!.calls).toBe(2);
    expect(cap!.inputTokens).toBe(1500);
    expect(cap!.outputTokens).toBe(300);
    expect(cap!.cacheReadTokens).toBe(50);
    expect(cap!.cacheWriteTokens).toBe(30);
    // 最後に観測したモデルを保持
    expect(cap!.model).toBe("claude-opus-4-8");

    // コストは各パスを「そのパスのモデル単価」で積む (cache 込み, @¥150/$):
    //   Sonnet: (1000*3 + 200*15 + 50*0.3)/1e6*150   = ¥0.90225
    //   Opus:   (500*15 + 100*75 + 30*18.75)/1e6*150 = ¥2.334375  → 合計 ¥3.236625
    // (全トークンを最後のモデル=Opus 単価で計算する誤りなら ¥6.75 超になる)
    expect(cap!.costJpy).toBeCloseTo(3.236625, 4);
  });

  it("is a no-op when no capture has begun (no ALS store)", () => {
    // beginAiUsageCapture を呼ばない別タスク。enterWith はコンテキスト跨ぎしない想定だが、
    // 少なくとも addUsageFromMessage が例外を投げないことを担保する。
    expect(() => addUsageFromMessage({ usage: { input_tokens: 10, output_tokens: 1 } })).not.toThrow();
  });

  it("ignores messages without usage", () => {
    beginAiUsageCapture();
    addUsageFromMessage(null);
    addUsageFromMessage({ model: "claude-sonnet-4-6" });
    const cap = getCapturedUsage();
    expect(cap!.calls).toBe(0);
    expect(cap!.inputTokens).toBe(0);
  });
});
