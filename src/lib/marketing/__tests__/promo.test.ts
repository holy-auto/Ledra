import { describe, it, expect } from "vitest";
import { isReiwaPromoActive, REIWA_PROMO_START, REIWA_PROMO_END } from "../promo";

describe("isReiwaPromoActive（令和の虎バナー表示期間）", () => {
  it("開始 = 2026-07-25 19:00 JST（エンバーゴ解除の放送公開時）", () => {
    // 19:00 JST = 10:00 UTC
    expect(new Date(REIWA_PROMO_START).toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });

  it("終了 = 2026-08-08 23:59 JST（放送〜2週間）", () => {
    // 23:59 JST = 14:59 UTC
    expect(new Date(REIWA_PROMO_END).toISOString()).toBe("2026-08-08T14:59:59.000Z");
  });

  it("開始前（7/25 昼・エンバーゴ中）は表示しない", () => {
    // 2026-07-25 12:00 JST = 03:00 UTC
    expect(isReiwaPromoActive(new Date("2026-07-25T03:00:00Z"))).toBe(false);
  });

  it("放送公開の 19:00 ちょうどは表示する", () => {
    expect(isReiwaPromoActive(new Date("2026-07-25T10:00:00Z"))).toBe(true);
  });

  it("期間中（7/28）は表示する", () => {
    expect(isReiwaPromoActive(new Date("2026-07-28T09:00:00Z"))).toBe(true);
  });

  it("終了後（8/9 JST）は表示しない", () => {
    // 2026-08-09 00:00 JST = 2026-08-08 15:00 UTC（終了 14:59:59 の直後）
    expect(isReiwaPromoActive(new Date("2026-08-08T15:00:00Z"))).toBe(false);
  });
});
