import { describe, it, expect } from "vitest";
import {
  clampUnit,
  toNormalized,
  parseDamageMap,
  serializeDamageMap,
  emptyDamageMap,
  DAMAGE_MAP_VERSION,
} from "../damageMap";

describe("clampUnit", () => {
  it("0..1 にクランプ、NaN は 0", () => {
    expect(clampUnit(0.5)).toBe(0.5);
    expect(clampUnit(-1)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(Number.NaN)).toBe(0);
  });
});

describe("toNormalized", () => {
  const rect = { left: 100, top: 50, width: 200, height: 400 };
  it("矩形内のクリックを 0..1 に変換する", () => {
    expect(toNormalized(200, 250, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(toNormalized(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(toNormalized(300, 450, rect)).toEqual({ x: 1, y: 1 });
  });
  it("矩形外はクランプされる", () => {
    expect(toNormalized(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(toNormalized(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
  });
  it("幅0は0に落ちる（0除算しない）", () => {
    expect(toNormalized(50, 50, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("parseDamageMap", () => {
  it("有効なマーカーを正規化して読む（文字列/オブジェクト両方）", () => {
    const json = JSON.stringify({ version: 1, markers: [{ id: "a", x: 0.3, y: 0.7, kind: "dent", note: "凹み" }] });
    const fromStr = parseDamageMap(json);
    expect(fromStr?.markers).toHaveLength(1);
    expect(fromStr?.markers[0]).toMatchObject({ id: "a", x: 0.3, y: 0.7, kind: "dent", note: "凹み" });
    const fromObj = parseDamageMap({ version: 1, markers: [{ x: 0.1, y: 0.2 }] });
    expect(fromObj?.markers[0].kind).toBe("other"); // 既定
  });

  it("座標が不正なマーカーは落とす", () => {
    const map = parseDamageMap({
      markers: [
        { x: "bad", y: 0.5 },
        { x: 0.5, y: 0.5 },
      ],
    });
    expect(map?.markers).toHaveLength(1);
  });

  it("範囲外座標はクランプ、不正 kind は other に寄せる", () => {
    const map = parseDamageMap({ markers: [{ x: 2, y: -1, kind: "explode" }] });
    expect(map?.markers[0]).toMatchObject({ x: 1, y: 0, kind: "other" });
  });

  it("空・マーカー0件・不正JSONは null", () => {
    expect(parseDamageMap("")).toBeNull();
    expect(parseDamageMap("{bad json")).toBeNull();
    expect(parseDamageMap({ markers: [] })).toBeNull();
    expect(parseDamageMap({ markers: [{ x: "x", y: "y" }] })).toBeNull();
    expect(parseDamageMap(null)).toBeNull();
  });
});

describe("serializeDamageMap round-trip", () => {
  it("直列化→パースで往復する", () => {
    const map = {
      version: DAMAGE_MAP_VERSION,
      markers: [{ id: "a", x: 0.4, y: 0.6, kind: "scratch" as const, note: "傷" }],
    };
    const json = serializeDamageMap(map);
    const back = parseDamageMap(json);
    expect(back?.markers[0]).toMatchObject({ x: 0.4, y: 0.6, kind: "scratch", note: "傷" });
  });
  it("マーカー0件は空文字（保存しない）", () => {
    expect(serializeDamageMap(emptyDamageMap())).toBe("");
  });
});
