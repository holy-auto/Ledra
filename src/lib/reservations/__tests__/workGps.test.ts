import { describe, it, expect } from "vitest";
import { parseWorkGps, workGpsPatch } from "../workGps";

describe("parseWorkGps", () => {
  it("妥当な緯度経度を返す", () => {
    expect(parseWorkGps({ lat: 35.68, lng: 139.76 })).toEqual({ lat: 35.68, lng: 139.76 });
  });
  it("片方だけ / 欠落 は null（両方揃って初めて記録する）", () => {
    expect(parseWorkGps({ lat: 35.68 })).toBeNull();
    expect(parseWorkGps({ lng: 139.76 })).toBeNull();
    expect(parseWorkGps({})).toBeNull();
    expect(parseWorkGps(null)).toBeNull();
  });
  it("範囲外は null（誤値を記録しない）", () => {
    expect(parseWorkGps({ lat: 91, lng: 139 })).toBeNull();
    expect(parseWorkGps({ lat: 35, lng: 181 })).toBeNull();
  });
  it("数値でない値は null", () => {
    expect(parseWorkGps({ lat: "35", lng: "139" })).toBeNull();
  });
});

describe("workGpsPatch", () => {
  it("座標があれば work_lat/lng/at を含むパッチ", () => {
    const at = "2026-07-27T12:00:00.000Z";
    expect(workGpsPatch({ lat: 35.68, lng: 139.76 }, at)).toEqual({
      work_lat: 35.68,
      work_lng: 139.76,
      work_gps_at: at,
    });
  });
  it("座標が無ければ空パッチ（既存の作業GPSを消さない）", () => {
    expect(workGpsPatch(null, "2026-07-27T12:00:00.000Z")).toEqual({});
  });
});
