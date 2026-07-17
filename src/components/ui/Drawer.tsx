"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { lockBodyScroll, unlockBodyScroll } from "./scrollLock";
import { isTopOverlay, registerOverlay, unregisterOverlay } from "./overlayStack";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const getFocusableElements = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }, []);

  // Register this instance's element in the shared overlay registry so its
  // keydown handling below can stay silent while a dialog opened on top of
  // it (e.g. a Modal opened from this Drawer's content) is the one that
  // should respond — neither component portals its DOM out of the tree, so
  // a nested Modal's controls would otherwise also get caught by this
  // Drawer's own focus trap / Escape handling. "Topmost" is checked live
  // via DOM containment (see overlayStack.ts) rather than registration
  // order, since React fires a nested child's effects before its parent's
  // — an order-based stack would wrongly rank this Drawer above a Modal
  // nested inside it if both open in the same commit.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    registerOverlay(el);
    return () => unregisterOverlay(el);
  }, [open]);

  // Close on Escape & focus trap
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!isTopOverlay(panelRef.current)) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, getFocusableElements]);

  // Focus first focusable element on open — re-checked inside the rAF
  // (not just at effect setup) since a nested overlay opened in the same
  // commit schedules its own focus rAF first (child effects run before the
  // parent's) but both callbacks fire in that same animation frame; without
  // this guard this Drawer's callback would steal focus back after it.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!isTopOverlay(panelRef.current)) return;
      const focusable = getFocusableElements();
      if (focusable.length > 0) focusable[0].focus();
    });
  }, [open, getFocusableElements]);

  // Ref-counted so a nested overlay (e.g. a Modal opened from within this
  // open Drawer) doesn't unlock the body out from under the other one.
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: "fade-in 150ms ease-out" }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-screen w-80 max-w-[90vw] bg-[var(--bg-surface-solid)] shadow-xl border-l border-border-default overflow-y-auto"
        style={{
          borderRadius: "var(--radius-xl) 0 0 var(--radius-xl)",
          animation: "slide-in-right 300ms var(--ease-out)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-[var(--bg-surface-solid)] px-5 py-4">
          <h2 className="text-base font-semibold text-primary">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="閉じる">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
