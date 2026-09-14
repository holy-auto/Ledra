import { describe, expect, it } from "vitest";

import { getWebReservationPresentation, reservationSurface } from "../reservationsPresentation";

describe("reservationSurface", () => {
  it("かんたん表示は店頭画面を使う", () => {
    expect(reservationSurface("simple", "admin")).toBe("storefront");
  });

  it("一覧重視は管理一覧を使う", () => {
    expect(reservationSurface("dense", "storefront")).toBe("admin");
  });

  it("標準表示は従来の画面選択を尊重する", () => {
    expect(reservationSurface("standard", "admin")).toBe("admin");
    expect(reservationSurface("standard", "storefront")).toBe("storefront");
  });

  it("新規作成時は表示設定に関係なく管理画面を使う", () => {
    expect(reservationSurface("simple", "storefront", true)).toBe("admin");
  });
});

describe("getWebReservationPresentation", () => {
  it("一覧重視では統計カードを省き、高密度表示にする", () => {
    expect(getWebReservationPresentation("dense")).toEqual({
      listVariant: "dense",
      pageSize: 200,
      showStatsCards: false,
    });
  });

  it("標準表示では統計カードを維持する", () => {
    expect(getWebReservationPresentation("standard").showStatsCards).toBe(true);
  });
});
