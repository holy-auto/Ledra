import { describe, it, expect } from "vitest";
import { mergeContentItems, type ContentListItem } from "@/lib/marketing/mergeContent";

describe("mergeContentItems", () => {
  it("sorts by publishedAt descending, undefined dates last", () => {
    const primary: ContentListItem[] = [
      { slug: "a", title: "A", publishedAt: "2026-01-01" },
      { slug: "c", title: "C" }, // no date → last
    ];
    const fallback: ContentListItem[] = [{ slug: "b", title: "B", publishedAt: "2026-03-01" }];
    const out = mergeContentItems(primary, fallback).map((i) => i.slug);
    expect(out).toEqual(["b", "a", "c"]);
  });

  it("de-duplicates by slug with primary (DB) winning over fallback (MDX)", () => {
    const primary: ContentListItem[] = [{ slug: "x", title: "DB title", publishedAt: "2026-05-01" }];
    const fallback: ContentListItem[] = [{ slug: "x", title: "MDX title", publishedAt: "2026-05-01" }];
    const out = mergeContentItems(primary, fallback);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("DB title");
  });

  it("handles ISO datetimes (DB) and plain dates (MDX) together", () => {
    const primary: ContentListItem[] = [{ slug: "db", title: "DB", publishedAt: "2026-07-25T10:00:00Z" }];
    const fallback: ContentListItem[] = [{ slug: "mdx", title: "MDX", publishedAt: "2026-07-20" }];
    const out = mergeContentItems(primary, fallback).map((i) => i.slug);
    expect(out).toEqual(["db", "mdx"]);
  });

  it("breaks ties by slug for deterministic ordering", () => {
    const items: ContentListItem[] = [
      { slug: "zebra", title: "Z", publishedAt: "2026-01-01" },
      { slug: "apple", title: "A", publishedAt: "2026-01-01" },
    ];
    const out = mergeContentItems(items, []).map((i) => i.slug);
    expect(out).toEqual(["apple", "zebra"]);
  });
});
