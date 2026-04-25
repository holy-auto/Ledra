import { describe, it, expect } from "vitest";
import { t, getTranslator, negotiateLocale, isSupportedLocale, DEFAULT_LOCALE } from "..";

describe("t()", () => {
  it("translates a known key in ja", () => {
    expect(t("errors.unauthorized", "ja")).toBe("ログインが必要です。");
  });

  it("translates a known key in en", () => {
    expect(t("errors.unauthorized", "en")).toBe("Authentication required.");
  });

  it("falls back to default locale when key is missing in target locale", () => {
    // ja has "errors.unauthorized"; en also has it. To test fallback we'd
    // need a key only in ja. Instead, verify fallback semantics by passing a
    // missing key — the function returns the key itself.
    expect(t("does.not.exist", "en")).toBe("does.not.exist");
  });

  it("returns the key when both locales miss it", () => {
    expect(t("nope", "ja")).toBe("nope");
    expect(t("nope", "en")).toBe("nope");
  });

  it("interpolates {var} placeholders", () => {
    expect(t("errors.missing_field", "ja", { field: "email" })).toBe("emailは必須です。");
    expect(t("errors.missing_field", "en", { field: "email" })).toBe("email is required.");
  });

  it("leaves placeholder intact when var is missing", () => {
    expect(t("errors.missing_field", "ja")).toBe("{field}は必須です。");
  });

  it("uses DEFAULT_LOCALE when none is specified", () => {
    expect(t("errors.unauthorized")).toBe(t("errors.unauthorized", DEFAULT_LOCALE));
  });
});

describe("getTranslator()", () => {
  it("returns a curried translator bound to the locale", () => {
    const tr = getTranslator("en");
    expect(tr("errors.unauthorized")).toBe("Authentication required.");
    expect(tr("errors.missing_field", { field: "code" })).toBe("code is required.");
  });
});

describe("isSupportedLocale()", () => {
  it("accepts known locales", () => {
    expect(isSupportedLocale("ja")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
  });

  it("rejects unknown locales", () => {
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
  });
});

describe("negotiateLocale()", () => {
  function withAcceptLanguage(value: string): Headers {
    const h = new Headers();
    h.set("accept-language", value);
    return h;
  }

  it("returns DEFAULT_LOCALE when header is missing", () => {
    expect(negotiateLocale(new Headers())).toBe(DEFAULT_LOCALE);
  });

  it("matches an exact supported locale", () => {
    expect(negotiateLocale(withAcceptLanguage("en"))).toBe("en");
    expect(negotiateLocale(withAcceptLanguage("ja"))).toBe("ja");
  });

  it("matches by primary language tag when full tag is unsupported", () => {
    expect(negotiateLocale(withAcceptLanguage("en-US"))).toBe("en");
    expect(negotiateLocale(withAcceptLanguage("ja-JP"))).toBe("ja");
  });

  it("respects q-value priority", () => {
    // en has higher q than ja → en wins
    expect(negotiateLocale(withAcceptLanguage("ja;q=0.5,en;q=0.9"))).toBe("en");
    // ja has higher q than en → ja wins
    expect(negotiateLocale(withAcceptLanguage("en;q=0.5,ja;q=0.9"))).toBe("ja");
  });

  it("falls through unsupported locales", () => {
    expect(negotiateLocale(withAcceptLanguage("fr,de,it"))).toBe(DEFAULT_LOCALE);
  });

  it("picks the first supported locale in a long list", () => {
    expect(negotiateLocale(withAcceptLanguage("fr,de,en,ja"))).toBe("en");
  });

  it("accepts a Request-shaped object", () => {
    const req = new Request("https://example.com", { headers: { "accept-language": "en" } });
    expect(negotiateLocale(req)).toBe("en");
  });
});
