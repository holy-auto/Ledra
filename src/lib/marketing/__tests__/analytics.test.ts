import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MARKETING_SEGMENTS, isMarketingPath } from "../analytics";

describe("isMarketingPath（GA4 で数えるページ）", () => {
  it("許可リストが src/app/(marketing) のフォルダと一致する", () => {
    const dirs = readdirSync(join(process.cwd(), "src/app/(marketing)"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...MARKETING_SEGMENTS].sort()).toEqual(dirs);
  });

  it("HP は数え、アプリ画面は数えない", () => {
    for (const p of ["/", "/pricing", "/blog/2026-07-11-coating-warranty-digital", "/glossary/hash"]) {
      expect(isMarketingPath(p), p).toBe(true);
    }
    for (const p of ["/admin", "/admin/invoices", "/login", "/signup", "/agent/login", "/pricingx"]) {
      expect(isMarketingPath(p), p).toBe(false);
    }
  });
});
