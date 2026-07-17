// Shared registry of open overlays' root DOM elements (Modal, Drawer,
// ConfirmDialog via Modal, BarcodeScanner). Neither component portals its
// DOM out of the React tree, so opening one from inside the other nests
// its element inside the outer one's panel.
//
// Every overlay root uses `position: fixed`, which always establishes its
// own stacking context — but a NESTED stacking context is confined inside
// its containing (DOM ancestor) overlay's own context: a BarcodeScanner
// (z-[60]) opened from within a Drawer (z-50) cannot use its z-index to
// visually escape ABOVE a completely separate, unrelated sibling Modal
// (z-50) — the scanner's z-60 only outranks *other content painted inside
// that same Drawer's stacking context*, not content in an entirely
// different top-level stacking context. So z-index (and DOM-order
// tiebreak) must be compared between each overlay's OUTERMOST open
// ancestor ("root" branch) — never between two elements at different
// nesting depths directly — and only after that branch-level comparison
// does "deepest overlay in the winning branch" decide the final answer
// (an ancestor is always superseded by whatever's nested inside it,
// regardless of any z-index, since a DOM descendant always paints on top
// of its own ancestor's content).
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
  for (const candidate of openElements) {
    if (!isTopOverlay(candidate)) continue;
    if (candidate.contains(document.activeElement)) return;
    const [first] = getFocusableElements(candidate);
    first?.focus();
    return;
  }
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

// The outermost currently-open overlay containing `el` (or `el` itself if
// nothing open contains it) -- the branch whose z-index/DOM-position
// actually competes against unrelated overlays.
function rootOverlayOf(el: HTMLElement): HTMLElement {
  let root = el;
  let changed = true;
  while (changed) {
    changed = false;
    for (const other of openElements) {
      if (other !== root && other.contains(root)) {
        root = other;
        changed = true;
        break;
      }
    }
  }
  return root;
}

export function isTopOverlay(el: HTMLElement | null): boolean {
  if (!el || !openElements.has(el)) return false;
  if (isAncestorOfAnotherOpenOverlay(el)) return false;

  const myRoot = rootOverlayOf(el);
  let winningRoot: HTMLElement | null = null;
  for (const candidate of openElements) {
    const candidateRoot = rootOverlayOf(candidate);
    if (!winningRoot) {
      winningRoot = candidateRoot;
      continue;
    }
    if (candidateRoot === winningRoot) continue;
    const candidateZ = zIndexOf(candidateRoot);
    const winnerZ = zIndexOf(winningRoot);
    if (
      candidateZ > winnerZ ||
      (candidateZ === winnerZ &&
        (winningRoot.compareDocumentPosition(candidateRoot) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    ) {
      winningRoot = candidateRoot;
    }
  }
  return myRoot === winningRoot;
}
