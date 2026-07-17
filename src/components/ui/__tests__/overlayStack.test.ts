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

  it("ranks the DOM-later sibling as topmost when neither contains the other", () => {
    // E.g. a Drawer that stays mounted while a separate confirmation Modal
    // opens next to it (not nested inside it) -- no containment relation
    // exists to settle it, so DOM document order is the tiebreaker (both
    // share the same z-index tier, so DOM-later is what actually paints on
    // top).
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);

    registerOverlay(first);
    expect(isTopOverlay(first)).toBe(true);

    registerOverlay(second);
    expect(isTopOverlay(first)).toBe(false);
    expect(isTopOverlay(second)).toBe(true);

    unregisterOverlay(second);
    expect(isTopOverlay(first)).toBe(true);

    unregisterOverlay(first);
    first.remove();
    second.remove();
  });

  it("still ranks by DOM order even when registration order disagrees", () => {
    // The exact bug Codex caught: a Drawer positioned earlier in the DOM
    // opens AFTER a Modal positioned later in the DOM is already open.
    // Registration/open order alone would (wrongly) rank the
    // later-to-register Drawer as topmost; DOM order must win instead,
    // since the DOM-later Modal is what's actually visible on top.
    const domFirst = document.createElement("div");
    const domSecond = document.createElement("div");
    document.body.append(domFirst, domSecond);

    // domSecond registers (opens) first...
    registerOverlay(domSecond);
    // ...then domFirst registers (opens) second, reversed from DOM order.
    registerOverlay(domFirst);

    expect(isTopOverlay(domSecond)).toBe(true);
    expect(isTopOverlay(domFirst)).toBe(false);

    unregisterOverlay(domFirst);
    unregisterOverlay(domSecond);
    domFirst.remove();
    domSecond.remove();
  });

  it("ranks a higher z-index sibling as topmost even when it's earlier in the DOM", () => {
    // BarcodeScanner (z-[60]) rendered as a sibling before an already-open
    // Modal/Drawer (z-50) must still outrank it -- DOM order is only the
    // tiebreaker when z-index actually ties.
    const scanner = document.createElement("div");
    const modal = document.createElement("div");
    scanner.style.zIndex = "60";
    modal.style.zIndex = "50";
    document.body.append(scanner, modal);

    registerOverlay(modal);
    registerOverlay(scanner);

    expect(isTopOverlay(scanner)).toBe(true);
    expect(isTopOverlay(modal)).toBe(false);

    unregisterOverlay(scanner);
    unregisterOverlay(modal);
    scanner.remove();
    modal.remove();
  });

  it("confines a nested overlay's z-index to its own ancestor's stacking context", () => {
    // The exact bug Codex caught: a BarcodeScanner (z-60) nested INSIDE a
    // Drawer (z-50) cannot use its z-60 to visually escape above a
    // completely separate, unrelated sibling Modal (z-50) -- CSS scopes a
    // nested stacking context inside its DOM ancestor's own context. If
    // the sibling Modal is DOM-later than the Drawer, the Modal's entire
    // stacking context (including the Drawer+scanner branch beneath it)
    // paints on top, so the Modal must be topmost, not the scanner.
    const drawer = document.createElement("div");
    const scanner = document.createElement("div");
    drawer.style.zIndex = "50";
    scanner.style.zIndex = "60";
    drawer.appendChild(scanner);

    const modal = document.createElement("div");
    modal.style.zIndex = "50";

    document.body.append(drawer, modal); // drawer (containing scanner) first, modal later

    registerOverlay(drawer);
    registerOverlay(scanner);
    registerOverlay(modal);

    expect(isTopOverlay(modal)).toBe(true);
    expect(isTopOverlay(scanner)).toBe(false);
    expect(isTopOverlay(drawer)).toBe(false);

    unregisterOverlay(modal);
    unregisterOverlay(scanner);
    unregisterOverlay(drawer);
    drawer.remove();
    modal.remove();
  });
});
