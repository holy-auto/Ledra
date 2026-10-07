import { describe, it, expect } from "vitest";
import { isGaTrackedPath } from "../analytics";

// 許可リストと (marketing) フォルダのずれは src/__tests__/proxyMarketingPaths.test.ts が見る。
describe("isGaTrackedPath（GA4 で数えるページ）", () => {
  it("HP と /signup は数え、アプリ画面は数えない", () => {
    for (const p of ["/", "/pricing", "/blog/2026-07-11-coating-warranty-digital", "/signup"]) {
      expect(isGaTrackedPath(p), p).toBe(true);
    }
    for (const p of ["/admin", "/admin/invoices", "/login", "/agent/login", "/signup-x"]) {
      expect(isGaTrackedPath(p), p).toBe(false);
    }
  });
});
