import { describe, it, expect } from "vitest";
import { AUTO_GLOSSARY, getGlossaryForLocale } from "../glossary";
import { SUPPORTED_LOCALES } from "../locales";

describe("AUTO_GLOSSARY", () => {
  it("全エントリに ja と en が存在する", () => {
    for (const entry of AUTO_GLOSSARY) {
      expect(entry.ja).toBeTruthy();
      expect(entry.en).toBeTruthy();
    }
  });

  it("20 用語以上を収録している", () => {
    expect(AUTO_GLOSSARY.length).toBeGreaterThanOrEqual(20);
  });
});

describe("getGlossaryForLocale()", () => {
  it("ja は空のマップを返す(恒等変換不要)", () => {
    expect(getGlossaryForLocale("ja")).toEqual({});
  });

  it("en は全用語を含むマップを返す", () => {
    const m = getGlossaryForLocale("en");
    expect(Object.keys(m).length).toBe(AUTO_GLOSSARY.length);
    expect(m["施工証明書"]).toBe("Workmanship Certificate");
  });

  it("vi が定義されたエントリはその訳語を返す", () => {
    const m = getGlossaryForLocale("vi");
    expect(m["施工証明書"]).toBe("Giấy chứng nhận thi công");
  });

  it("target にエントリがないロケールは en にフォールバックする", () => {
    // AUTO_GLOSSARY のうち NFC は vi="NFC" と明示しているので別のケースで確認
    // 将来 vi が未定義の用語が追加された場合に en が返る仕組みの検証
    const m = getGlossaryForLocale("vi");
    // 全キーが存在する(vi 未定義分は en フォールバック)
    expect(Object.keys(m).length).toBe(AUTO_GLOSSARY.length);
  });

  it("全サポートロケールでエラーなくマップを生成できる", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(() => getGlossaryForLocale(locale)).not.toThrow();
    }
  });
});
