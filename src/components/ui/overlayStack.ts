// Shared registry of open overlays' root DOM elements (Modal, Drawer,
// ConfirmDialog via Modal, BarcodeScanner). Neither component portals its
// DOM out of the React tree, so opening one from inside the other nests
// its element inside the outer one's panel — an ancestor overlay is never
// topmost, regardless of registration order (React fires a nested child's
// effects before its parent's, so an order-based rule alone would get an
// outer Drawer wrongly ranked above a Modal nested inside it).
//
// Overlays that AREN'T nested inside one another (rendered as siblings —
// e.g. a Drawer that stays mounted while a separate confirmation Modal or
// BarcodeScanner opens next to it) have no containment relationship to
// break the tie. This kit doesn't use one uniform z-index for every
// overlay (BarcodeScanner is z-[60], Modal/Drawer are z-50), so the actual
// computed z-index is compared first — the higher tier always visually
// paints on top regardless of DOM order or open order. Only when z-index
// ties does DOM document order become the tiebreaker (for equal stacking
// level, the browser paints whichever is LATER in DOM order on top).
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

function zIndexOf(el: HTMLElement): number {
  const z = parseInt(getComputedStyle(el).zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}

export function isTopOverlay(el: HTMLElement | null): boolean {
  if (!el || !openElements.has(el)) return false;
  if (isAncestorOfAnotherOpenOverlay(el)) return false;
  let winner: HTMLElement | null = null;
  for (const candidate of openElements) {
    if (isAncestorOfAnotherOpenOverlay(candidate)) continue;
    if (!winner) {
      winner = candidate;
      continue;
    }
    const candidateZ = zIndexOf(candidate);
    const winnerZ = zIndexOf(winner);
    if (
      candidateZ > winnerZ ||
      (candidateZ === winnerZ && (winner.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    ) {
      winner = candidate;
    }
  }
  return winner === el;
}
