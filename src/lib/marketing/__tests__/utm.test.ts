// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readUtm, pickUtm, utmToPersist, UTM_COOKIE } from "../utm";

function setSearch(search: string) {
  // jsdom は history.replaceState で location.search を更新できる
  window.history.replaceState({}, "", search);
}

function setUtmCookie(utm: Record<string, string>) {
  document.cookie = `${UTM_COOKIE}=${encodeURIComponent(JSON.stringify(utm))}`;
}

function clearUtmCookie() {
  document.cookie = `${UTM_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

describe("pickUtm", () => {
  it("既知の utm キーだけ拾い、値は120字に丸める", () => {
    const long = "x".repeat(200);
    const params = new URLSearchParams(`utm_source=tora&utm_campaign=${long}&foo=bar`);
    const out = pickUtm(params);
    expect(out.utm_source).toBe("tora");
    expect(out.utm_campaign?.length).toBe(120);
    expect((out as Record<string, string>).foo).toBeUndefined();
  });
});

describe("utmToPersist (proxy が着地時に保存するか判定)", () => {
  it("cookie 未設定 + URL に utm → 保存する（first-touch）", () => {
    const params = new URLSearchParams("utm_source=tora&utm_medium=broadcast");
    expect(utmToPersist(params, false)).toEqual({ utm_source: "tora", utm_medium: "broadcast" });
  });

  it("既に cookie があれば保存しない（first-touch 優先）", () => {
    const params = new URLSearchParams("utm_source=newsletter");
    expect(utmToPersist(params, true)).toBeNull();
  });

  it("URL に utm が無ければ保存しない", () => {
    expect(utmToPersist(new URLSearchParams("q=1"), false)).toBeNull();
  });
});

describe("readUtm (URL 優先 → cookie フォールバック)", () => {
  beforeEach(() => {
    clearUtmCookie();
    setSearch("/");
  });

  it("URL に utm があれば URL を返す", () => {
    setSearch("/poc?utm_source=google&utm_medium=cpc");
    expect(readUtm()).toEqual({ utm_source: "google", utm_medium: "cpc" });
  });

  it("令和の虎導線: URL に utm が無ければ middleware 保存の cookie を返す", () => {
    // middleware が着地時に保存した first-touch cookie
    setUtmCookie({ utm_source: "tora", utm_medium: "broadcast", utm_campaign: "reiwa-tora-2026" });
    // CTA で utm の付かない /poc へ遷移
    setSearch("/poc");
    expect(readUtm()).toEqual({
      utm_source: "tora",
      utm_medium: "broadcast",
      utm_campaign: "reiwa-tora-2026",
    });
  });

  it("URL の utm は cookie より優先される", () => {
    setUtmCookie({ utm_source: "tora" });
    setSearch("/poc?utm_source=google");
    expect(readUtm()).toEqual({ utm_source: "google" });
  });

  it("URL にも cookie にも utm が無ければ空", () => {
    setSearch("/poc");
    expect(readUtm()).toEqual({});
  });

  it("壊れた cookie でも例外を投げず空を返す", () => {
    document.cookie = `${UTM_COOKIE}=not-json`;
    setSearch("/poc");
    expect(readUtm()).toEqual({});
  });
});
