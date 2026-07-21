// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import InspectionSignaturePad from "../InspectionSignaturePad";

// jsdom has no ResizeObserver; this component's viewport-resize fix (a real
// device rotation while the pad is open) depends on one existing.
let resizeCallback: ResizeObserverCallback | null = null;
class FakeResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeCallback = cb;
  }
  observe() {}
  disconnect() {}
}

describe("InspectionSignaturePad", () => {
  beforeEach(() => {
    resizeCallback = null;
    (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  });

  it("renders and observes the canvas for resize without throwing", () => {
    const { container } = render(
      <InspectionSignaturePad onSign={vi.fn()} onCancel={vi.fn()} orderTitle="Test Order" />,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(resizeCallback).not.toBeNull();
  });

  it("does not throw when a resize fires while the pad is open", () => {
    render(<InspectionSignaturePad onSign={vi.fn()} onCancel={vi.fn()} orderTitle="Test Order" />);
    expect(() => resizeCallback?.([], {} as ResizeObserver)).not.toThrow();
  });
});
