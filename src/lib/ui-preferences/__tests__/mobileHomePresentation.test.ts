import { describe, expect, it } from "vitest";
import { getHomePresentation } from "../../../../apps/mobile/src/lib/homePresentation";

describe("getHomePresentation", () => {
  it("かんたん表示では次の操作を先頭にして詳細な状態を隠す", () => {
    expect(getHomePresentation("simple")).toEqual({
      activeWorkLimit: 3,
      collapseScope: true,
      nextActionFirst: true,
      showDetailedStatus: false,
    });
  });

  it("標準表示では通常の順序と情報量を維持する", () => {
    expect(getHomePresentation("standard")).toEqual({
      activeWorkLimit: 3,
      collapseScope: false,
      nextActionFirst: false,
      showDetailedStatus: true,
    });
  });

  it("一覧表示では進行中案件を6件まで表示する", () => {
    expect(getHomePresentation("dense")).toEqual({
      activeWorkLimit: 6,
      collapseScope: false,
      nextActionFirst: false,
      showDetailedStatus: true,
    });
  });
});
