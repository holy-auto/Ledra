// Shared registry of open overlays' root DOM elements (Modal, Drawer,
// ConfirmDialog via Modal). Neither component portals its DOM out of the
// React tree, so opening one from inside the other nests its element
// inside the outer one's panel — an ancestor overlay is never topmost,
// regardless of registration order (React fires a nested child's effects
// before its parent's, so an order-based rule alone would get an outer
// Drawer wrongly ranked above a Modal nested inside it). Overlays that
// AREN'T nested inside one another (rendered as siblings — e.g. a Drawer
// that stays mounted while a separate confirmation Modal opens next to it)
// have no containment relationship to break the tie, so among those the
// most recently opened one (last in the registry's insertion order) wins.
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
  let mostRecentLeaf: HTMLElement | null = null;
  for (const candidate of openElements) {
    if (!isAncestorOfAnotherOpenOverlay(candidate)) mostRecentLeaf = candidate;
  }
  return mostRecentLeaf === el;
}
