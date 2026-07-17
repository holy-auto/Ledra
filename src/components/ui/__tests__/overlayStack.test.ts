// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { registerOverlay, unregisterOverlay, isTopOverlay } from "../overlayStack";

describe("overlayStack", () => {
  it("ranks the innermost open element as topmost regardless of registration order", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    outer.appendChild(inner);

    // Registration order deliberately reversed from DOM nesting (the exact
    // case a nested Drawer+Modal hit when both open in the same React
    // commit — the child's effect fires before the parent's): outer must
    // still lose to inner because inner sits inside outer's DOM subtree.
    registerOverlay(outer);
    registerOverlay(inner);

    expect(isTopOverlay(outer)).toBe(false);
    expect(isTopOverlay(inner)).toBe(true);

    unregisterOverlay(inner);
    unregisterOverlay(outer);
  });

  it("treats a lone open overlay as topmost", () => {
    const el = document.createElement("div");
    registerOverlay(el);
    expect(isTopOverlay(el)).toBe(true);
    unregisterOverlay(el);
  });

  it("stops considering an unregistered element topmost", () => {
    const el = document.createElement("div");
    registerOverlay(el);
    unregisterOverlay(el);
    expect(isTopOverlay(el)).toBe(false);
  });
});
