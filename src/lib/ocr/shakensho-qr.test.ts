import { describe, it, expect } from "vitest";
import { parseShakenshoCode } from "./shakensho-qr";

// 仕様書準拠の定数
const FW = "　"; // 全角ブランク
const HW = " "; // 半角ブランク

// ─────────────────────────────────────────────
// QR2（6 フィールド）
// ─────────────────────────────────────────────

describe("parseShakenshoCode / 二次元コード 2（6 フィールド）", () => {
  it("登録番号・車台番号・原動機型式を抽出する", () => {
    // 標板:尾張小牧 分類:500 カナ:や 一連:1000
    const raw = `2/尾張小牧５００や１０００/1/HGC14-12345/ABCDEF12345/1`;
    expect(parseShakenshoCode(raw)).toEqual({
      plate_display: "尾張小牧 ５００ や １０００",
      vin: "HGC14-12345",
      engine_model: "ABCDEF12345",
    });
  });

  it("全角ブランクでパディングされた登録番号を整形する（品川5・5あ99）", () => {
    // 標板:品川(2字+全角パディング2) 分類:５５(2字+全角パディング1) カナ:あ 一連:全角パディング2+９９
    const raw = `2/品川${FW}${FW}５５${FW}あ${FW}${FW}９９/1/VIN123/ENGINE123/1`;
    const result = parseShakenshoCode(raw);
    expect(result?.plate_display).toBe("品川 ５５ あ ９９");
  });

  it("車台番号の職権打刻プレフィックス [41] を保持する", () => {
    const raw = `2/品川${FW}${FW}${FW}${FW}１${FW}${FW}${FW}あ${FW}${FW}${FW}１/1/[41]12345/*FUMEI/1`;
    const result = parseShakenshoCode(raw);
    expect(result?.vin).toBe("[41]12345");
    expect(result?.engine_model).toBe("*FUMEI");
  });

  it("原動機型式の特殊マーカー (*K, *SHISAKU, *KUMITATE) を保持する", () => {
    const cases: Array<[string, string]> = [
      ["ABCDEF12345*K", "ABCDEF12345*K"],
      ["*SHISAKU", "*SHISAKU"],
      ["*KUMITATE", "*KUMITATE"],
    ];
    for (const [input, expected] of cases) {
      const raw = `2/尾張小牧５００や１０００/1/VIN1/${input}/1`;
      expect(parseShakenshoCode(raw)?.engine_model).toBe(expected);
    }
  });
});

// ─────────────────────────────────────────────
// QR3（21 フィールド）
// ─────────────────────────────────────────────

function buildQR3(overrides: Partial<Record<number, string>> = {}): string {
  // デフォルトは全フィールド有効値を持った例
  const fields: string[] = [
    "2", // 1: バージョン
    "120", // 2: 車台番号打刻位置
    "123450234", // 3: 型式指定番号・類別区分番号
    "999999", // 4: 有効期間満了日（電子車検証券面）常に 999999
    "230104", // 5: 有効期間満了日（閲覧アプリ表示）
    "230105", // 6: 有効期間満了日（記録事項帳票）
    "2301", // 7: 初度登録年月
    "ABCDEF12345", // 8: 型式
    "0110", // 9: 軸重（前前）→ 1100 kg
    "0120", // 10: 軸重（前後）→ 1200 kg
    `-${HW}${HW}${HW}`, // 11: 軸重（後前）→ null
    `-${HW}${HW}${HW}`, // 12: 軸重（後後）→ null
    "10", // 13: 騒音規制
    "100", // 14: 近接排気騒音規制値
    "1", // 15: 駆動方式 → 全輪駆動
    "1", // 16: オパシメータ測定車
    "A", // 17: NOx・PM 測定モード
    "1234", // 18: NOx 値
    "12345", // 19: PM 値
    "230104", // 20: 保安基準適用年月日
    "01", // 21: 燃料コード → ガソリン
  ];
  for (const [idx, val] of Object.entries(overrides)) {
    fields[Number(idx)] = val ?? fields[Number(idx)];
  }
  return fields.join("/");
}

describe("parseShakenshoCode / 二次元コード 3（21 フィールド）", () => {
  it("完全なレコードを正しくパースする", () => {
    const result = parseShakenshoCode(buildQR3());
    expect(result).toEqual({
      chassis_punch_position: "120",
      model_code: "123450234",
      expiry_date: "2023-01-04", // 閲覧アプリ用が優先
      first_registration: "2023-01",
      model: "ABCDEF12345",
      axle_weights_kg: {
        front_front: 1100,
        front_rear: 1200,
        rear_front: undefined,
        rear_rear: undefined,
      },
      drive_type: "全輪駆動",
      safety_standard_date: "2023-01-04",
      fuel_type: "ガソリン",
    });
  });

  it("閲覧アプリ用有効期間が未設定なら記録事項用にフォールバックする", () => {
    const raw = buildQR3({ 4: "999999", 5: "230201" });
    const result = parseShakenshoCode(raw);
    expect(result?.expiry_date).toBe("2023-02-01");
  });

  it("両方の有効期間が未設定なら undefined", () => {
    const raw = buildQR3({ 4: "999999", 5: "999999" });
    const result = parseShakenshoCode(raw);
    expect(result?.expiry_date).toBeUndefined();
  });

  it("存在しない日付 (0230 / 0431) は round-trip で弾かれ未設定になる", () => {
    // 日レンジ内 (dd=30/31) でも実在しない日を弾く。フォールバック先も無効なら undefined。
    expect(parseShakenshoCode(buildQR3({ 4: "230230", 5: "999999" }))?.expiry_date).toBeUndefined();
    expect(parseShakenshoCode(buildQR3({ 4: "230431", 5: "999999" }))?.expiry_date).toBeUndefined();
  });

  it("実在する日付は正しくパースされる (閏日 2024-02-29)", () => {
    expect(parseShakenshoCode(buildQR3({ 4: "240229" }))?.expiry_date).toBe("2024-02-29");
  });

  it("初度登録年月 9999 は未設定扱い", () => {
    const raw = buildQR3({ 6: "9999" });
    const result = parseShakenshoCode(raw);
    expect(result?.first_registration).toBeUndefined();
  });

  it("車台番号打刻位置が null プレースホルダ (-▲▲) なら設定しない", () => {
    const raw = buildQR3({ 1: `-${HW}${HW}` });
    const result = parseShakenshoCode(raw);
    expect(result?.chassis_punch_position).toBeUndefined();
  });

  it("燃料コードテーブルを正しく引く", () => {
    const cases: Array<[string, string | undefined]> = [
      ["01", "ガソリン"],
      ["02", "軽油"],
      ["05", "電気"],
      ["14", "ガソリン・電気"],
      ["99", "その他"],
      ["00", undefined], // "-" は undefined 扱い
    ];
    for (const [code, expected] of cases) {
      const raw = buildQR3({ 20: code });
      expect(parseShakenshoCode(raw)?.fuel_type).toBe(expected);
    }
  });

  it("駆動方式コードを正しく引く", () => {
    const cases: Array<[string, string | undefined]> = [
      ["1", "全輪駆動"],
      ["2", "全輪駆動以外"],
      ["0", "設定値無し"],
      ["-", "一般車"],
    ];
    for (const [code, expected] of cases) {
      const raw = buildQR3({ 14: code });
      expect(parseShakenshoCode(raw)?.drive_type).toBe(expected);
    }
  });

  it("軸重は 10kg 単位を kg に換算する（0110 → 1100 kg）", () => {
    const raw = buildQR3({ 8: "0110" });
    const result = parseShakenshoCode(raw);
    expect(result?.axle_weights_kg?.front_front).toBe(1100);
  });

  it("全軸重がゼロなら axle_weights_kg を設定しない", () => {
    const nullAxle = `-${HW}${HW}${HW}`;
    const raw = buildQR3({ 8: nullAxle, 9: nullAxle, 10: nullAxle, 11: nullAxle });
    const result = parseShakenshoCode(raw);
    expect(result?.axle_weights_kg).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// 複数 QR コード（QR2 + QR3）
// ─────────────────────────────────────────────

describe("parseShakenshoCode / 複数 QR マージ", () => {
  it("QR2 + QR3 を改行区切りで同時解析する", () => {
    const qr2 = `2/尾張小牧５００や１０００/1/HGC14-12345/ABCDEF12345*K/1`;
    const qr3 = buildQR3();
    const result = parseShakenshoCode(`${qr2}\n${qr3}`);

    expect(result).toMatchObject({
      plate_display: "尾張小牧 ５００ や １０００",
      vin: "HGC14-12345",
      engine_model: "ABCDEF12345*K",
      model: "ABCDEF12345",
      model_code: "123450234",
      fuel_type: "ガソリン",
      expiry_date: "2023-01-04",
    });
  });
});

// ─────────────────────────────────────────────
// 不正な入力
// ─────────────────────────────────────────────

describe("parseShakenshoCode / 不正入力", () => {
  it("空文字列は null", () => {
    expect(parseShakenshoCode("")).toBeNull();
  });

  it("短すぎる入力は null", () => {
    expect(parseShakenshoCode("abc")).toBeNull();
  });

  it("バージョン以外の先頭文字は null", () => {
    expect(parseShakenshoCode("X/foo/bar/baz/qux/1")).toBeNull();
  });

  it("フィールド数が 6 でも 21 でもなければ null", () => {
    expect(parseShakenshoCode("2/foo/bar/baz")).toBeNull();
  });

  it("JSON 形式は null（旧暫定パーサは削除済み）", () => {
    expect(parseShakenshoCode('{"maker":"トヨタ"}')).toBeNull();
  });
});
