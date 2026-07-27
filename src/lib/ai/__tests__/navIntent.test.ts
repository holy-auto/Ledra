import { describe, it, expect } from "vitest";
import { resolveHrefFromCatalog } from "@/lib/ai/navIntent";
import { adminCommandItems } from "@/components/ui/Sidebar";

// トラスト境界の要: モデルが返した href は必ずカタログ照合してから使う。
// 実在パスだけ通し、創作された / 外部の URL は null に落とすことを保証する。
describe("resolveHrefFromCatalog", () => {
  const catalog = adminCommandItems();

  it("passes through a real admin href unchanged", () => {
    const known = catalog[0].href; // 例: /admin
    expect(resolveHrefFromCatalog(known)).toBe(known);
  });

  it("normalizes trailing slash / whitespace / case to the canonical href", () => {
    const known = catalog.find((c) => c.href === "/admin/reservations")?.href ?? catalog[0].href;
    expect(resolveHrefFromCatalog(`  ${known.toUpperCase()}/ `)).toBe(known);
  });

  it("rejects a hallucinated internal path", () => {
    expect(resolveHrefFromCatalog("/admin/evil-not-a-real-page")).toBeNull();
    expect(resolveHrefFromCatalog("/evil")).toBeNull();
  });

  it("rejects an external / absolute URL (open-redirect guard)", () => {
    expect(resolveHrefFromCatalog("https://evil.example.com")).toBeNull();
    expect(resolveHrefFromCatalog("//evil.example.com")).toBeNull();
  });

  it("rejects empty / nullish input", () => {
    expect(resolveHrefFromCatalog(null)).toBeNull();
    expect(resolveHrefFromCatalog(undefined)).toBeNull();
    expect(resolveHrefFromCatalog("   ")).toBeNull();
  });
});
