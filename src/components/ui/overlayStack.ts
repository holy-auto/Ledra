// Shared registry of open overlays' root DOM elements (Modal, Drawer,
// ConfirmDialog via Modal, BarcodeScanner). Neither component portals its
// DOM out of the React tree, so opening one from inside the other nests
// its element inside the outer one's panel.
//
// Every overlay root uses `position: fixed`, which always establishes its
// own stacking context — but a NESTED stacking context is confined inside
// its containing (DOM ancestor) overlay's own context: a BarcodeScanner
// (z-[60]) opened from within a Modal (z-50) cannot use its z-index to
// visually escape ABOVE a completely separate sibling Modal (z-50), even
// if that sibling has no scanner of its own — the nested scanner's z-60
// only outranks other content painted inside its own Modal's stacking
// context. Finding the true topmost overlay therefore means walking the
// nesting tree one level at a time: at the top level, rank the overlays
// with no open ancestor against each other; whichever wins, look at what's
// nested directly inside IT and rank those against each other; repeat
// until reaching a level with nothing nested inside the winner. Comparing
// two overlays' raw z-index is only ever valid between such direct
// siblings — never between overlays at different nesting depths.
const openElements = new Set<HTMLElement>();

// Shared with every overlay's own focus trap, so there's one definition of
// "focusable" instead of three copies drifting apart.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function registerOverlay(el: HTMLElement) {
  openElements.add(el);
}

export function unregisterOverlay(el: HTMLElement) {
  openElements.delete(el);
  // The closing overlay's DOM node is on its way out; if focus was inside
  // it, it falls back to <body>, which the newly-exposed overlay's own Tab
  // trap doesn't catch (it only redirects once activeElement is already
  // its first/last control). Move focus back into whatever's now topmost.
  const topmost = topmostOverlay();
  if (!topmost || topmost.contains(document.activeElement)) return;
  const [first] = getFocusableElements(topmost);
  first?.focus();
}

function zIndexOf(el: HTMLElement): number {
  const z = parseInt(getComputedStyle(el).zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}

// The nearest currently-open overlay that contains `el`, or null if none
// does (i.e. `el` is a top-level overlay).
function immediateParentOverlayOf(el: HTMLElement): HTMLElement | null {
  const containers = [...openElements].filter((o) => o !== el && o.contains(el));
  if (containers.length === 0) return null;
  // The immediate (nearest) parent is the one every other container in the
  // set also contains — i.e. the most deeply nested of them.
  return containers.find((c) => containers.every((other) => other === c || other.contains(c))) ?? containers[0];
}

// Open overlays whose immediate parent is exactly `parent` (null = the
// top-level siblings with no open ancestor at all).
function directChildOverlaysOf(parent: HTMLElement | null): HTMLElement[] {
  return [...openElements].filter((candidate) => immediateParentOverlayOf(candidate) === parent);
}

// `a` visually paints on top of `b` when they're direct siblings under the
// same immediate parent (or both top-level): higher z-index wins; on a
// tie, whichever is LATER in DOM document order does (how the browser
// resolves equal z-index within one stacking context).
function beats(a: HTMLElement, b: HTMLElement): boolean {
  const za = zIndexOf(a);
  const zb = zIndexOf(b);
  if (za !== zb) return za > zb;
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function topmostOverlay(): HTMLElement | null {
  let winner: HTMLElement | null = null;
  let level = directChildOverlaysOf(winner);
  while (level.length > 0) {
    winner = level.reduce((a, b) => (beats(b, a) ? b : a));
    level = directChildOverlaysOf(winner);
  }
  return winner;
}

export function isTopOverlay(el: HTMLElement | null): boolean {
  if (!el || !openElements.has(el)) return false;
  return topmostOverlay() === el;
}
