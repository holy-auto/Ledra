import { describe, it, expect, vi } from "vitest";
import { afterOrInline } from "../afterOrInline";

// ユニットテストは Next のリクエストスコープ外で走るため、実際の `after()` は
// 「`after` was called outside a request scope」で throw する。afterOrInline は
// その throw を握って fn を即時実行にフォールバックし、呼び出し側が 500 に
// ならないことを、実物の next/server を使って（モックせずに）検証する。
describe("afterOrInline", () => {
  it("リクエストスコープ外では after() の throw を握り、fn を即時実行にフォールバックする", async () => {
    let ran = false;
    const fn = vi.fn(async () => {
      ran = true;
    });

    expect(() => afterOrInline(fn)).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(ran).toBe(true);
  });
});
