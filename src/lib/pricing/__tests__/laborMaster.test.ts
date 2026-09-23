import { describe, it, expect } from "vitest";
import {
  ANY_MODEL,
  findEntry,
  laborPrice,
  modelCodeFromChassis,
  normalizeKey,
  parseLaborCsv,
  resolveRate,
  type LaborEntry,
} from "../laborMaster";

const entry = (
  model_code: string,
  part: string,
  hours: number | null,
  fixed_price: number | null = null,
): LaborEntry => ({
  model_code,
  part_key: normalizeKey(part),
  hours,
  fixed_price,
  label: null,
});

describe("normalizeKey / modelCodeFromChassis", () => {
  it("品番の表記ゆれを吸収する", () => {
    expect(normalizeKey("08A40-PL0-C30-01")).toBe(normalizeKey("08a40pl0c3001"));
    expect(normalizeKey("ＥＴＣセットアップ")).toBe(normalizeKey("ETCｾｯﾄｱｯﾌﾟ"));
  });

  it("F-NO から型式を取り出し、番号だけなら null", () => {
    expect(modelCodeFromChassis("GP3-1017220")).toBe("GP3");
    expect(modelCodeFromChassis("ｊｆ５－１２３４５６７")).toBe("JF5");
    expect(modelCodeFromChassis("1204166")).toBeNull();
    expect(modelCodeFromChassis(null)).toBeNull();
  });
});

describe("findEntry", () => {
  const entries = [
    entry("JF5", "08E25PH0C01", 1.2),
    entry("DG5", "08E25PH0C01", 1.5),
    entry(ANY_MODEL, "08E25PH0C01", 9),
    entry(ANY_MODEL, "ETCセットアップ", null, 3000),
  ];

  it("同じ品番でも型式で別の行を引く", () => {
    expect(findEntry(entries, "jf5", "08E25-PH0-C01")?.hours).toBe(1.2);
    expect(findEntry(entries, "DG5", "08E25PH0C01")?.hours).toBe(1.5);
  });

  it("完全一致が無ければ型式共通、それも無ければ null", () => {
    expect(findEntry(entries, "GP3", "08E25PH0C01")?.hours).toBe(9);
    expect(findEntry(entries, "GP3", "ETCｾｯﾄｱｯﾌﾟ")?.fixed_price).toBe(3000);
    expect(findEntry(entries, "GP3", "08A40PW1V60")).toBeNull();
    expect(findEntry(entries, "GP3", "")).toBeNull();
  });
});

describe("laborPrice / resolveRate", () => {
  it("工数×店舗単価、定額優先、0h は 0 円、単価なしは null", () => {
    expect(laborPrice(entry("JF5", "x", 1.2), 9000)).toBe(10800);
    expect(laborPrice(entry("JF5", "x", 1.2, 5000), 9000)).toBe(5000);
    expect(laborPrice(entry("JF5", "x", 0), null)).toBe(0);
    expect(laborPrice(entry("JF5", "x", 1.2), null)).toBeNull();
  });

  it("支店単価が優先、未設定なら自社単価", () => {
    expect(resolveRate(8000, 9000)).toBe(8000);
    expect(resolveRate(null, 9000)).toBe(9000);
    expect(resolveRate(0, null)).toBeNull();
  });
});

describe("parseLaborCsv", () => {
  it("ヘッダを飛ばし、型式・品番を正規化、重複は後勝ち、不正行はエラー", () => {
    const { rows, errors } = parseLaborCsv(
      [
        "型式,品番,工数h,定額円,名称,出典URL",
        "jf5,08E25-PH0-C01,1.2,,ETC2.0車載器,https://example.com/a",
        "*,ETCセットアップ,,3300,,",
        "JF5,08E25PH0C01,1.4,,,",
        ",08B4032RA40B,0.5,,,",
        "JF5,08B4032RA40B,,,,",
        "JF5,08B4032RA40B,-1,,,",
      ].join("\n"),
    );
    expect(rows).toEqual([
      {
        model_code: "JF5",
        part_key: "08E25PH0C01",
        part_number: "08E25PH0C01",
        hours: 1.4,
        fixed_price: null,
        label: null,
        source_url: null,
      },
      {
        model_code: "*",
        part_key: normalizeKey("ETCセットアップ"),
        part_number: "ETCセットアップ",
        hours: null,
        fixed_price: 3300,
        label: null,
        source_url: null,
      },
    ]);
    expect(errors).toHaveLength(3);
  });
});
