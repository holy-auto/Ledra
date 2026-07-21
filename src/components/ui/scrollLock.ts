// Ref-counted body scroll lock shared by every overlay (Modal, Drawer,
// ConfirmDialog via Modal) so nested overlays don't clobber each other —
// e.g. opening a Modal from inside an open Drawer and closing the Modal
// must leave the Drawer's lock in place, not reset the body to scrollable.
let lockCount = 0;

export function lockBodyScroll() {
  if (lockCount === 0) document.body.style.overflow = "hidden";
  lockCount++;
}

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = "";
}
