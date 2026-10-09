import { describe, it, expect } from "vitest";
import { parseFilmThickness, formatThickness } from "../filmThickness";

describe("parseFilmThickness", () => {
  it("数値・数値文字列を読み、空行と壊れた値を落とす", () => {
    const rows = parseFilmThickness({
      film_thickness: [
        { location: " ボンネット ", before_um: 80, after_um: "95", notes: "" },
        { location: "", before_um: null, after_um: "", notes: "メモだけ" },
        { location: "ルーフ", before_um: "abc", after_um: 100 },
        "壊れた行",
      ],
    });
    expect(rows).toEqual([
      { location: "ボンネット", before_um: 80, after_um: 95, notes: "" },
      { location: "ルーフ", before_um: null, after_um: 100, notes: "" },
    ]);
  });
  it("preset が無い・配列でないなら空", () => {
    expect(parseFilmThickness(null)).toEqual([]);
    expect(parseFilmThickness({ film_thickness: "x" })).toEqual([]);
  });
  it("表示は前後・片方だけを区別する", () => {
    const r = { location: "", notes: "" };
    expect(formatThickness({ ...r, before_um: 80, after_um: 95 })).toBe("施工前 80 / 施工後 95 µm");
    expect(formatThickness({ ...r, before_um: null, after_um: 95 })).toBe("95 µm（施工後）");
    expect(formatThickness({ ...r, before_um: 80, after_um: null })).toBe("80 µm（施工前）");
  });
});
