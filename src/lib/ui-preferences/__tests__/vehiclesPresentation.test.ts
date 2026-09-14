import { describe, expect, it } from "vitest";

import { getVehicleListPresentation } from "../vehiclesPresentation";

describe("getVehicleListPresentation", () => {
  it("かんたん表示では一括操作と統計を前面に出さない", () => {
    expect(getVehicleListPresentation("simple")).toEqual({
      variant: "simple",
      showBulkActions: false,
      showStats: false,
    });
  });

  it("標準表示では既存情報を維持する", () => {
    expect(getVehicleListPresentation("standard")).toEqual({
      variant: "standard",
      showBulkActions: true,
      showStats: true,
    });
  });

  it("一覧重視では統計を省き一括操作を維持する", () => {
    expect(getVehicleListPresentation("dense")).toEqual({
      variant: "dense",
      showBulkActions: true,
      showStats: false,
    });
  });
});
