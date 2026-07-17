// Shared registry of open overlays' root DOM elements (Modal, Drawer,
// ConfirmDialog via Modal). Neither component portals its DOM out of the
// React tree, so opening one from inside the other nests its element
// inside the outer one's panel. "Topmost" is decided by live DOM
// containment at keydown time, NOT by registration order: React fires a
// nested child's effects before its parent's, so if both mount/open in the
// same commit an order-based stack would get an outer Drawer wrongly
// ranked above a Modal nested inside it. An overlay is topmost as long as
// no other currently-open overlay's element sits inside its own.
const openElements = new Set<HTMLElement>();

export function registerOverlay(el: HTMLElement) {
  openElements.add(el);
}

export function unregisterOverlay(el: HTMLElement) {
  openElements.delete(el);
}

export function isTopOverlay(el: HTMLElement | null): boolean {
  if (!el || !openElements.has(el)) return false;
  for (const other of openElements) {
    if (other !== el && el.contains(other)) return false;
  }
  return true;
}
