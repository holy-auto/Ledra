// Shared stack of currently-open overlays (Modal, Drawer, ConfirmDialog via
// Modal). Neither component portals its DOM out of the React tree, so
// opening one from inside the other nests its elements inside the outer
// one's panel — the outer overlay's own Escape/Tab keydown handler would
// otherwise still fire (and its focus trap would still include the inner
// overlay's controls) even though the inner one is now topmost. Each
// overlay only acts on a keydown when it's the top of this stack.
let stack: symbol[] = [];

export function pushOverlay(): symbol {
  const id = Symbol();
  stack.push(id);
  return id;
}

export function popOverlay(id: symbol) {
  stack = stack.filter((s) => s !== id);
}

export function isTopOverlay(id: symbol) {
  return stack.length > 0 && stack[stack.length - 1] === id;
}
