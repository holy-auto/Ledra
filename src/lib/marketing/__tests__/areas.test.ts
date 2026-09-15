import { describe, it, expect } from "vitest";
import { PREFECTURES, AREA_SERVED_JSONLD } from "../areas";

describe("PREFECTURES", () => {
  it("47件ある", () => {
    expect(PREFECTURES).toHaveLength(47);
  });

  it("重複が無い", () => {
    expect(new Set(PREFECTURES).size).toBe(47);
  });

  it("都道府県の接尾辞で終わる（北海道を含む）", () => {
    for (const p of PREFECTURES) expect(p).toMatch(/(都|道|府|県)$/);
  });

  it("都・道・府・県の数が実際の区分と一致する", () => {
    const count = (suffix: string) => PREFECTURES.filter((p) => p.endsWith(suffix)).length;
    expect(count("都")).toBe(1); // 東京都
    expect(count("道")).toBe(1); // 北海道
    expect(count("府")).toBe(2); // 京都府・大阪府
    expect(count("県")).toBe(43);
  });
});

describe("AREA_SERVED_JSONLD", () => {
  it("国1件 ＋ 47都道府県で48件", () => {
    expect(AREA_SERVED_JSONLD).toHaveLength(48);
    expect(AREA_SERVED_JSONLD[0]).toEqual({ "@type": "Country", name: "日本" });
  });
});
