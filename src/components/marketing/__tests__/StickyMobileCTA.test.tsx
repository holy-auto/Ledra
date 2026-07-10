// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StickyMobileCTA } from "../StickyMobileCTA";

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
}

describe("StickyMobileCTA", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.cookie = "__ledra_consent=granted";
    setScrollY(0);
  });

  it("ファーストビュー内では表示されない", () => {
    render(<StickyMobileCTA />);
    expect(screen.queryByText("無料で試す")).toBeNull();
  });

  it("閾値を超えてスクロールすると表示される", () => {
    render(<StickyMobileCTA />);
    setScrollY(window.innerHeight);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(screen.getByText("無料で試す")).toBeDefined();
  });

  it("Cookie 同意前は閾値を超えても表示されない", () => {
    document.cookie = "__ledra_consent=; Max-Age=0";
    render(<StickyMobileCTA />);
    setScrollY(window.innerHeight);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(screen.queryByText("無料で試す")).toBeNull();
  });

  it("閾値より下でマウントされた場合（アンカー直リンク）はスクロールなしで表示される", () => {
    setScrollY(window.innerHeight);
    render(<StickyMobileCTA />);
    expect(screen.getByText("無料で試す")).toBeDefined();
  });

  it("閉じると消え、同セッションの再マウントでも再表示されない", () => {
    setScrollY(window.innerHeight);
    const { unmount } = render(<StickyMobileCTA />);
    fireEvent.click(screen.getByLabelText("このバーを閉じる"));
    expect(screen.queryByText("無料で試す")).toBeNull();
    expect(sessionStorage.getItem("ledra-sticky-cta-dismissed")).toBe("1");

    unmount();
    render(<StickyMobileCTA />);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(screen.queryByText("無料で試す")).toBeNull();
  });
});
