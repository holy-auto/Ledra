// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { captureUtm, readUtm } from "../utm";

function setSearch(search: string) {
  // jsdom は history.replaceState で location.search を更新できる
  window.history.replaceState({}, "", search);
}

describe("utm first-touch attribution", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setSearch("/");
  });

  it("readUtm は URL の utm を返す", () => {
    setSearch("/poc?utm_source=google&utm_medium=cpc");
    expect(readUtm()).toEqual({ utm_source: "google", utm_medium: "cpc" });
  });

  it("令和の虎導線: 着地で保存 → utm 無しのフォームURLでも保存値を返す", () => {
    // /tora → /news?utm_source=tora... に着地
    setSearch("/news/2026-07-25-reiwa-no-tora?utm_source=tora&utm_medium=broadcast&utm_campaign=reiwa-tora-2026");
    captureUtm();
    // CTA で utm の付かない /poc へ遷移
    setSearch("/poc");
    captureUtm(); // 空URLでは何もしない（保存値を消さない）
    expect(readUtm()).toEqual({
      utm_source: "tora",
      utm_medium: "broadcast",
      utm_campaign: "reiwa-tora-2026",
    });
  });

  it("captureUtm は first-touch を優先し、後続の別 utm で上書きしない", () => {
    setSearch("/news?utm_source=tora");
    captureUtm();
    setSearch("/?utm_source=newsletter");
    captureUtm();
    // URL 優先のため直下は newsletter だが、保存値は tora のまま
    expect(readUtm()).toEqual({ utm_source: "newsletter" });
    setSearch("/poc");
    expect(readUtm()).toEqual({ utm_source: "tora" });
  });

  it("URL にも保存にも utm が無ければ空", () => {
    expect(readUtm()).toEqual({});
  });
});
