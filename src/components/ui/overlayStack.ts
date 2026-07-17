// Shared registry of open overlays' root DOM elements (Modal, Drawer,
// ConfirmDialog via Modal, BarcodeScanner). Neither component portals its
// DOM out of the React tree, so opening one from inside the other nests
// its element inside the outer one's panel — an ancestor overlay is never
// topmost, regardless of registration order (React fires a nested child's
// effects before its parent's, so an order-based rule alone would get an
// outer Drawer wrongly ranked above a Modal nested inside it).
//
// Overlays that AREN'T nested inside one another (rendered as siblings —
// e.g. a Drawer that stays mounted while a separate confirmation Modal
// opens next to it) have no containment relationship to break the tie.
// These all share the same z-index tier in this kit, so for equal
// stacking level the browser paints whichever is LATER in DOM document
// order on top — that's the tiebreaker here, not "most recently opened":
// open/registration order can disagree with paint order (a Drawer earlier
// in the DOM that opens *after* an already-open, DOM-later Modal still
// paints underneath it), and keyboard "topmost" must match what's actually
// visible.
const openElements = new Set<HTMLElement>();

export function registerOverlay(el: HTMLElement) {
  openElements.add(el);
}

export function unregisterOverlay(el: HTMLElement) {
  openElements.delete(el);
}

function isAncestorOfAnotherOpenOverlay(el: HTMLElement): boolean {
  for (const other of openElements) {
    if (other !== el && el.contains(other)) return true;
  }
  return false;
}

export function isTopOverlay(el: HTMLElement | null): boolean {
  if (!el || !openElements.has(el)) return false;
  if (isAncestorOfAnotherOpenOverlay(el)) return false;
  let winner: HTMLElement | null = null;
  for (const candidate of openElements) {
    if (isAncestorOfAnotherOpenOverlay(candidate)) continue;
    if (!winner || (winner.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      winner = candidate;
    }
  }
  return winner === el;
}
