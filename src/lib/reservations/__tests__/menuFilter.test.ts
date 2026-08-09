import { describe, it, expect } from "vitest";
import {
  menuCategoriesOf,
  filterMenuItems,
  resolveMenuCategory,
  shouldRevealMenu,
  UNCATEGORIZED,
  MENU_ALL,
  MENU_REVEAL_THRESHOLD,
} from "../menuFilter";

const items = [
  { name: "ガラスコーティング", category_large: "コーティング" },
  { name: "セラミックコーティング", category_large: "コーティング" },
  { name: "オイル交換", category_large: "整備" },
  { name: "その他作業", category_large: null },
];

describe("menuCategoriesOf", () => {
  it("returns unique categories and appends 未分類 when a null category exists", () => {
    expect(menuCategoriesOf(items)).toEqual(["コーティング", "整備", UNCATEGORIZED]);
  });

  it("omits 未分類 when every item has a category", () => {
    expect(menuCategoriesOf(items.slice(0, 3))).toEqual(["コーティング", "整備"]);
  });
});

describe("filterMenuItems", () => {
  it("returns all items when no query/category", () => {
    expect(filterMenuItems(items, "", null)).toHaveLength(4);
  });

  it("filters by category", () => {
    expect(filterMenuItems(items, "", "コーティング").map((m) => m.name)).toEqual([
      "ガラスコーティング",
      "セラミックコーティング",
    ]);
  });

  it("matches null-category items under 未分類", () => {
    expect(filterMenuItems(items, "", UNCATEGORIZED).map((m) => m.name)).toEqual(["その他作業"]);
  });

  it("filters by case-insensitive substring query", () => {
    expect(filterMenuItems(items, "オイル", null).map((m) => m.name)).toEqual(["オイル交換"]);
  });

  it("combines query and category (AND)", () => {
    expect(filterMenuItems(items, "セラミック", "コーティング").map((m) => m.name)).toEqual(["セラミックコーティング"]);
    expect(filterMenuItems(items, "オイル", "コーティング")).toHaveLength(0);
  });
});

describe("resolveMenuCategory", () => {
  it("maps the すべて sentinel to null (no filter)", () => {
    expect(resolveMenuCategory(MENU_ALL)).toBeNull();
  });
  it("passes through null and real categories unchanged", () => {
    expect(resolveMenuCategory(null)).toBeNull();
    expect(resolveMenuCategory("コーティング")).toBe("コーティング");
  });
});

describe("shouldRevealMenu", () => {
  const big = MENU_REVEAL_THRESHOLD + 1;

  it("always reveals when item count is within the threshold", () => {
    expect(shouldRevealMenu(MENU_REVEAL_THRESHOLD, "", null)).toBe(true);
  });

  it("hides a large list until narrowed", () => {
    expect(shouldRevealMenu(big, "", null)).toBe(false);
  });

  it("reveals a large list once a query is entered", () => {
    expect(shouldRevealMenu(big, "オイル", null)).toBe(true);
    // 空白だけの検索語は絞り込みとみなさない
    expect(shouldRevealMenu(big, "   ", null)).toBe(false);
  });

  it("reveals a large list when a category (incl. すべて) is selected", () => {
    expect(shouldRevealMenu(big, "", "コーティング")).toBe(true);
    expect(shouldRevealMenu(big, "", MENU_ALL)).toBe(true);
  });
});
