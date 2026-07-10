// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import CertFormProgressRail, { type CertFormSection } from "../CertFormProgressRail";

const SECTIONS: CertFormSection[] = [
  { id: "sec-a", label: "セクションA" },
  { id: "sec-b", label: "セクションB" },
  { id: "sec-c", label: "セクションC" },
];

let observedCallback: IntersectionObserverCallback | null = null;

class FakeIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    observedCallback = cb;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("CertFormProgressRail", () => {
  beforeEach(() => {
    observedCallback = null;
    // @ts-expect-error - test stub, only the members the component uses matter
    window.IntersectionObserver = FakeIntersectionObserver;
    SECTIONS.forEach((s) => {
      const el = document.createElement("div");
      el.id = s.id;
      document.body.appendChild(el);
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("shows the first section as active on initial render", () => {
    render(<CertFormProgressRail sections={SECTIONS} />);
    expect(screen.getByText("1 / 3 — セクションA")).toBeTruthy();
  });

  it("updates the active section when the observer reports a new intersecting target", () => {
    render(<CertFormProgressRail sections={SECTIONS} />);
    expect(observedCallback).not.toBeNull();

    const target = document.getElementById("sec-c")!;
    act(() => {
      observedCallback!(
        [
          {
            isIntersecting: true,
            target,
            boundingClientRect: { top: 0 } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByText("3 / 3 — セクションC")).toBeTruthy();
  });
});
