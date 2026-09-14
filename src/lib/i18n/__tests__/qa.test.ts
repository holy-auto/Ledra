import { describe, it, expect } from "vitest";
import {
  findMissingTranslations,
  findPlaceholderMismatches,
  computeTranslationCoverage,
  findGlossaryGaps,
} from "../qa";

describe("findMissingTranslations()", () => {
  it("キーが揃っていれば空配列を返す", () => {
    const messages = {
      ja: { a: "あ", b: "い" },
      en: { a: "A", b: "B" },
    };
    expect(findMissingTranslations(messages)).toEqual([]);
  });

  it("片方にないキーを検出する", () => {
    const messages = {
      ja: { a: "あ", b: "い" },
      en: { a: "A" },
    };
    const missing = findMissingTranslations(messages);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toEqual({ locale: "en", key: "b" });
  });

  it("ネストしたキーをドットパスで報告する", () => {
    const messages = {
      ja: { errors: { auth: "認証エラー" } },
      en: {},
    };
    const missing = findMissingTranslations(messages);
    expect(missing).toEqual([{ locale: "en", key: "errors.auth" }]);
  });

  it("3 ロケール以上でも動作する", () => {
    const messages = {
      ja: { a: "あ" },
      en: { a: "A" },
      vi: {},
    };
    const missing = findMissingTranslations(messages);
    expect(missing).toEqual([{ locale: "vi", key: "a" }]);
  });
});

describe("findPlaceholderMismatches()", () => {
  it("プレースホルダが一致すれば空配列を返す", () => {
    const messages = {
      ja: { msg: "{name}さん" },
      en: { msg: "Hi {name}" },
    };
    expect(findPlaceholderMismatches(messages, "ja")).toEqual([]);
  });

  it("対象ロケールに不足するプレースホルダを検出する", () => {
    const messages = {
      ja: { msg: "{name}の{count}件" },
      en: { msg: "Items for {name}" },
    };
    const result = findPlaceholderMismatches(messages, "ja");
    expect(result).toHaveLength(1);
    expect(result[0].missing).toEqual(["count"]);
    expect(result[0].extra).toEqual([]);
  });

  it("対象ロケールの余分なプレースホルダを検出する", () => {
    const messages = {
      ja: { msg: "{name}さん" },
      en: { msg: "Hi {name} ({extra})" },
    };
    const result = findPlaceholderMismatches(messages, "ja");
    expect(result).toHaveLength(1);
    expect(result[0].extra).toEqual(["extra"]);
  });

  it("ベースロケールが存在しなければ空配列を返す", () => {
    expect(findPlaceholderMismatches({ en: { a: "A" } }, "ja")).toEqual([]);
  });

  it("ベースロケール自身は比較対象外", () => {
    const messages = {
      ja: { msg: "{name}" },
    };
    expect(findPlaceholderMismatches(messages, "ja")).toEqual([]);
  });

  it("空文字の翻訳（未着手のスタブ）はプレースホルダ欠落として検出する", () => {
    // キー自体が無い（undefined）場合はスキップするが、空文字は
    // 「翻訳したがプレースホルダが全部消えた」実際の不一致として扱う。
    const messages = {
      ja: { msg: "{name}さん" },
      vi: { msg: "" },
    };
    const result = findPlaceholderMismatches(messages, "ja");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ key: "msg", locale: "vi", missing: ["name"], extra: [] });
  });
});

describe("computeTranslationCoverage()", () => {
  it("全キーが揃えば 100%", () => {
    const messages = {
      ja: { a: "あ", b: "い" },
      en: { a: "A", b: "B" },
    };
    const cov = computeTranslationCoverage(messages);
    expect(cov.overallPercent).toBe(100);
    expect(cov.perLocale.ja.percent).toBe(100);
    expect(cov.perLocale.en.percent).toBe(100);
  });

  it("欠落があれば 100% 未満", () => {
    const messages = {
      ja: { a: "あ", b: "い" },
      en: { a: "A" },
    };
    const cov = computeTranslationCoverage(messages);
    expect(cov.perLocale.en.percent).toBe(50);
    expect(cov.perLocale.ja.percent).toBe(100);
    expect(cov.overallPercent).toBe(75);
  });

  it("空メッセージでも例外を投げない", () => {
    expect(computeTranslationCoverage({}).overallPercent).toBe(100);
  });
});

describe("findGlossaryGaps()", () => {
  it("全ロケールが揃えば空配列", () => {
    const glossary = {
      parts: [{ ja: "タイヤ", en: "Tire", vi: "Lốp" }],
    };
    const gaps = findGlossaryGaps(glossary, ["ja", "en", "vi"]);
    expect(gaps).toEqual([]);
  });

  it("欠落ロケールを検出する", () => {
    const glossary = {
      parts: [{ ja: "タイヤ", en: "Tire" }],
    };
    const gaps = findGlossaryGaps(glossary, ["ja", "en", "vi"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].term).toBe("parts:タイヤ");
    expect(gaps[0].missingLocales).toEqual(["vi"]);
  });

  it("複数カテゴリ・複数エントリを処理する", () => {
    const glossary = {
      body: [
        { ja: "板金", en: "Panel repair", vi: "Sửa tấm" },
        { ja: "塗装", en: "Paint" },
      ],
      coating: [{ ja: "コーティング", en: "Coating" }],
    };
    const gaps = findGlossaryGaps(glossary, ["ja", "en", "vi"]);
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.term)).toContain("body:塗装");
    expect(gaps.map((g) => g.term)).toContain("coating:コーティング");
  });
});
