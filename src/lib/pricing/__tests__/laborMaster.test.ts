import { describe, it, expect } from "vitest";
import {
  ANY_MODEL,
  classifyAgainstExisting,
  describeConflict,
  formatImportSummary,
  DHAPPY_SOURCE_URL,
  dHappyPasteToCsv,
  findEntry,
  findEntryWithFallback,
  laborPrice,
  modelCodeFromChassis,
  normalizeKey,
  parseLaborCsv,
  resolveRate,
  sheetRowsToLaborCsv,
  splitChassisInput,
  summarizeCoverage,
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
        tc_code: "",
        part_key: "08E25PH0C01",
        part_number: "08E25PH0C01",
        hours: 1.4,
        fixed_price: null,
        label: null,
        source_url: null,
      },
      {
        model_code: "*",
        tc_code: "",
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

describe("classifyAgainstExisting", () => {
  const { rows } = parseLaborCsv(
    ["GP3,08R04SYY001,0.4,,,", "GP3,08P18SYY011,0.1,,,", "JF5,08R04SYY001,0.5,,,", "*,ETCセットアップ,,3300,,"].join(
      "\n",
    ),
  );

  it("同じ型式・品番で同値は書かない、値違いは衝突、型式違いは別物として新規", () => {
    const r = classifyAgainstExisting(rows, [
      { model_code: "GP3", part_key: "08R04SYY001", hours: "0.40", fixed_price: null }, // numeric は文字列で来る
      { model_code: "GP3", part_key: "08P18SYY011", hours: 0.2, fixed_price: null },
      { model_code: "*", part_key: normalizeKey("ETCセットアップ"), hours: null, fixed_price: 3300 },
    ]);
    expect(r.unchanged.map((x) => x.part_key)).toEqual(["08R04SYY001", normalizeKey("ETCセットアップ")]);
    expect(
      r.conflicts.map((c) => [c.conflict.part_number, c.conflict.current.hours, c.conflict.incoming.hours]),
    ).toEqual([["08P18SYY011", 0.2, 0.1]]);
    expect(r.toInsert.map((x) => [x.model_code, x.part_key])).toEqual([["JF5", "08R04SYY001"]]);
    expect(r.metaUpdates).toEqual([]);
  });

  it("今回が 0h なら 0h でない登録済みを上書きしない。登録済みが 0h なら上書きする", () => {
    const { rows: incoming } = parseLaborCsv("GP3,A,0,,,\nGP3,B,0.5,,,\nGP3,C,0,,,");
    const r = classifyAgainstExisting(incoming, [
      { model_code: "GP3", part_key: "A", hours: 1.4, fixed_price: null },
      { model_code: "GP3", part_key: "B", hours: 0, fixed_price: null },
      { model_code: "GP3", part_key: "C", hours: null, fixed_price: 3300 },
    ]);
    expect(r.unchanged.map((x) => x.part_key)).toEqual(["A", "C"]);
    expect(r.conflicts.map((c) => [c.row.part_key, c.row.hours])).toEqual([["B", 0.5]]);
  });

  it("値違いで上書きする行も、今回が空欄の品名・出典は既存を残す", () => {
    const { rows: incoming } = parseLaborCsv("GP3,08P18SYY011,0.1,,,");
    const r = classifyAgainstExisting(incoming, [
      {
        model_code: "GP3",
        part_key: "08P18SYY011",
        hours: 0.2,
        fixed_price: null,
        label: "ラバーマット",
        source_url: "https://sfh.honda.co.jp/T001",
      },
    ]);
    expect(r.conflicts.map((c) => [c.row.hours, c.row.label, c.row.source_url])).toEqual([
      [0.1, "ラバーマット", "https://sfh.honda.co.jp/T001"],
    ]);
  });

  it("値が同じで品名・出典だけ違う行は更新対象、空欄は既存を消さない", () => {
    const { rows: incoming } = parseLaborCsv("GP3,08R04SYY001,0.4,,ドアバイザー,\nGP3,08P18SYY011,0.1,,,");
    const r = classifyAgainstExisting(incoming, [
      {
        model_code: "GP3",
        part_key: "08R04SYY001",
        hours: 0.4,
        fixed_price: null,
        part_number: "08R04SYY001",
        label: null,
        source_url: "https://x",
      },
      {
        model_code: "GP3",
        part_key: "08P18SYY011",
        hours: 0.1,
        fixed_price: null,
        part_number: "08P18SYY011",
        label: "ラバーマット",
        source_url: null,
      },
    ]);
    expect(r.metaUpdates.map((x) => [x.part_key, x.label, x.source_url])).toEqual([
      ["08R04SYY001", "ドアバイザー", "https://x"],
    ]);
    expect(r.unchanged.map((x) => x.part_key)).toEqual(["08P18SYY011"]);
    expect(r.conflicts).toEqual([]);
  });
});

describe("formatImportSummary / describeConflict", () => {
  it("件数と衝突内容を文にする", () => {
    const conflict = {
      model_code: "GP3",
      part_number: "08P18SYY011",
      label: "ラバーマット",
      current: { hours: 0.2, fixed_price: null },
      incoming: { hours: 0.1, fixed_price: null },
    };
    expect(formatImportSummary({ inserted: 2, updated: 1, unchanged: 1, overwritten: [conflict], errors: [] })).toBe(
      "新規 2 件、上書き 1 件、登録済み（同じ値）1 件",
    );
    expect(describeConflict(conflict)).toBe("GP3 08P18SYY011（ラバーマット） 登録済み 0.2h → 今回 0.1h");
  });
});

describe("summarizeCoverage", () => {
  it("型式ごとにまとめ、未収集を先頭・台数順に並べ、型式の無い番号は分ける", () => {
    const { rows, unparsed } = summarizeCoverage(
      ["JF5-1511014", "DG5-1204166", "RP8-1344844", "jf5-1405694", "GP3-1017220", "1508937", " ", "1508937"],
      { GP3: 3 },
    );
    expect(rows.map((r) => [r.model_code, r.sample_chassis, r.vehicle_count, r.registered_rows])).toEqual([
      ["JF5", "JF5-1511014", 2, 0],
      ["DG5", "DG5-1204166", 1, 0],
      ["RP8", "RP8-1344844", 1, 0],
      ["GP3", "GP3-1017220", 1, 3],
    ]);
    expect(unparsed).toEqual(["1508937"]);
  });

  it("同じ車台番号は1台として数える", () => {
    const { rows } = summarizeCoverage(["JF5-1511014", "jf5-1511014", "JF5-1405694"], {});
    expect(rows[0].vehicle_count).toBe(2);
  });
});

describe("splitChassisInput", () => {
  it("改行・カンマ・読点・空白で分け、ハイフン前後の空白は詰める", () => {
    expect(splitChassisInput("GP3 - 1017220\nJF5-1511014, DG5-1204166、RP8-1344844 JF5-1405694")).toEqual([
      "GP3-1017220",
      "JF5-1511014",
      "DG5-1204166",
      "RP8-1344844",
      "JF5-1405694",
    ]);
  });
});

describe("findEntryWithFallback", () => {
  const entries = [
    entry("DG5", "08E2631XD00", 1.0),
    // d-Happy 由来は品名がキー（発注書の全角表記とは NFKC で一致する）
    entry("DG5", "ETC2.0車載器 取付アタッチメント/取付位置:ドライバーロアーカバー部", 1.2),
  ];

  it("品番で当たればそれを使う", () => {
    expect(findEntryWithFallback(entries, "DG5", "08E2631XD00", "何か")).toMatchObject({
      by: "key",
      entry: { hours: 1 },
    });
  });

  it("品番で無ければ品名で引く（全角・スラッシュ・コロンの表記ゆれを吸収）", () => {
    const r = findEntryWithFallback(
      entries,
      "DG5",
      "08E2632RD00",
      "ＥＴＣ２．０車載器　取付アタッチメント／取付位置：ドライバーロアーカバー部",
    );
    expect(r).toMatchObject({ by: "alt_key", entry: { hours: 1.2 } });
    expect(findEntryWithFallback(entries, "DG5", "08E2632RD00", null)).toEqual({ entry: null, by: null });
  });

  it("d-Happy 貼り付け登録（品番が key・品名は label）にも品名で当たる", () => {
    const pasted = [{ ...entry("GP3", "08R04SYY001", 0.4), label: "ドアバイザー（フロント／リア４枚セット）" }];
    expect(findEntryWithFallback(pasted, "GP3", "08R04SYY099", "ドアバイザー(フロント/リア4枚セット)")).toMatchObject({
      by: "alt_key",
      entry: { hours: 0.4 },
    });
  });
});

describe("sheetRowsToLaborCsv", () => {
  const head = ["車種", "グレード", "項目", "取付工数", "車台番号", "カテゴリ", "備考"];

  it("d-Happy 収集形式: 型式を車台番号から取り、食い違いは後の行を採り、空欄は登録しない", () => {
    const r = sheetRowsToLaborCsv([
      head,
      ["N-BOX", "N-BOX", "ドアバイザー", "0.4", "JF5-1511014", "ベーシック", ""],
      ["N-BOX", "N-BOX", "ドアバイザー", "0.4", "JF5-1405694", "ベーシック", ""],
      ["N-BOX", "N-BOX", "ETC2.0車載器 取付アタッチメント", "1.4", "JF5-1511014", "インテリア", "自動追加"],
      ["N-BOX", "N-BOX", "ETC2.0車載器 取付アタッチメント", "0", "JF5-1405694", "インテリア", ""],
      ["N-BOX", "N-BOX", "LEDフォグライト 5,800K", "0.30000000000000004", "JF5-1511014", "エクステリア", ""],
      ["N-BOX", "N-BOX", "リアカメラ", "", "JF5-1511014", "A&V", "算出不可"],
      ["WR-V", "Z", "フロアマット", "0.2", "1204166", "", ""],
    ]);
    expect(r.count).toBe(3);
    expect(r.overwritten).toEqual(["JF5 ETC2.0車載器 取付アタッチメント: 1.4h → 0h（後の行の 1.4h を採用）"]);
    expect(r.errors).toHaveLength(2);
    const { rows, errors } = parseLaborCsv(r.csv);
    expect(errors).toEqual([]);
    expect(rows.map((x) => [x.model_code, x.part_key, x.hours])).toEqual([
      ["JF5", normalizeKey("ドアバイザー"), 0.4],
      ["JF5", normalizeKey("ETC2.0車載器 取付アタッチメント"), 1.4], // 0h は食い違いでは採らない
      ["JF5", normalizeKey("LEDフォグライト 5,800K"), 0.3], // 全角カンマで書き出し、照合キーは元の表記と一致
    ]);
  });

  it("TCコード列: TC で差があれば TC 別の行も出し、差が無ければ TC 問わずの1行だけ", () => {
    const h = ["項目", "取付工数", "車台番号", "TCコード"];
    const r = sheetRowsToLaborCsv([
      h,
      ["ETC", "1.2", "JF5-1511014", "JF5-110"],
      ["ETC", "1.1", "JF5-1405694", "JF5-120"],
      ["マット", "0.2", "JF5-1511014", "JF5-110"],
      ["マット", "0.2", "JF5-1405694", "JF5-120"],
    ]);
    const { rows, errors } = parseLaborCsv(r.csv);
    expect(errors).toEqual([]);
    expect(rows.map((x) => [x.part_key, x.tc_code, x.hours])).toEqual([
      [normalizeKey("ETC"), "", 1.1],
      [normalizeKey("ETC"), "JF5110", 1.2],
      [normalizeKey("マット"), "", 0.2],
    ]);
    // 引く側: TC 指定があれば TC 専用、無い TC は TC 問わずへ
    const entries = rows.map((x) => ({ ...x, label: x.label }));
    expect(findEntry(entries, "JF5", "ETC", "JF5-110")?.hours).toBe(1.2);
    expect(findEntry(entries, "JF5", "ETC", "JF5-120")?.hours).toBe(1.1);
    expect(findEntry(entries, "JF5", "ETC")?.hours).toBe(1.1);
    expect(findEntry(entries, "JF5", "マット", "JF5-110")?.hours).toBe(0.2);
  });

  it("工数マスタ形式はそのまま、見出しが分からなければエラー", () => {
    const std = sheetRowsToLaborCsv([
      ["型式", "品番", "工数h", "定額円", "名称", "出典URL"],
      ["GP3", "08R04SYY001", "0.4", "", "ドアバイザー", ""],
    ]);
    expect(parseLaborCsv(std.csv).rows.map((x) => x.part_key)).toEqual(["08R04SYY001"]);
    // 空行があっても「N行目」は元の行番号のまま
    const withGap = sheetRowsToLaborCsv([["型式", "品番", "工数h"], ["GP3", "A", "0.1"], [], ["GP3", "", "0.2"]]);
    expect(withGap.count).toBe(2);
    expect(parseLaborCsv(withGap.csv).errors[0]).toMatch(/^4行目/);
    expect(sheetRowsToLaborCsv([["a", "b"]]).errors).toHaveLength(1);
  });
});
