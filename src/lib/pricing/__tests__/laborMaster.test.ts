import { describe, it, expect } from "vitest";
import {
  ANY_MODEL,
  DHAPPY_SOURCE_URL,
  dHappyPasteToCsv,
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

  it("DB の文字数上限を超える行は行単位のエラー", () => {
    const { rows, errors } = parseLaborCsv(
      `${"A".repeat(21)},08E25PH0C01,1,,,\nJF5,${"9".repeat(101)},1,,,\nJF5,X,1,,,`,
    );
    expect(rows.map((r) => r.part_key)).toEqual(["X"]);
    expect(errors).toHaveLength(2);
  });
});

describe("dHappyPasteToCsv", () => {
  // 代表が d-Happy（GP3-1017220）の装着用品確認からコピーした実物
  const paste = [
    "項目用品品番コピー\t価格\t取付工数\t合計金額",
    "ドアバイザー（フロント／リア４枚セット）",
    "08R04SYY001\t9,900\t0.4\t",
    "13,860",
    "ラバーマット（縁高タイプ）　フロント／左右セット（回転式ホルダー固定仕様）",
    "08P18SYY011\t3,575\t0.1\t",
    "4,565",
    "ナンバープレートロックボルト（３本入セット／ボルト長２０ｍｍ）",
    "08P25EJ5C00A\t3,300\t0\t",
    "3,300",
  ].join("\r\n");

  it("品番・工数・品名を読み、工数 CSV として取り込める", () => {
    const { csv, count, errors } = dHappyPasteToCsv(paste, "gp3");
    expect(errors).toEqual([]);
    expect(count).toBe(3);
    const { rows } = parseLaborCsv(csv);
    expect(rows.map((r) => [r.model_code, r.part_key, r.hours, r.label])).toEqual([
      ["GP3", "08R04SYY001", 0.4, "ドアバイザー（フロント／リア４枚セット）"],
      ["GP3", "08P18SYY011", 0.1, "ラバーマット（縁高タイプ）　フロント／左右セット（回転式ホルダー固定仕様）"],
      ["GP3", "08P25EJ5C00A", 0, "ナンバープレートロックボルト（３本入セット／ボルト長２０ｍｍ）"],
    ]);
    expect(rows[0].source_url).toBe(DHAPPY_SOURCE_URL);
  });

  it("型式なし・該当行なしはエラー", () => {
    expect(dHappyPasteToCsv(paste, "").errors).toHaveLength(1);
    expect(dHappyPasteToCsv("ただの文章", "GP3").errors).toHaveLength(1);
  });
});
