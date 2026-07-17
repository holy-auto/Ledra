"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { lockBodyScroll, unlockBodyScroll } from "./scrollLock";
import { isTopOverlay, popOverlay, pushOverlay } from "./overlayStack";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayIdRef = useRef<symbol | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }, []);

  // Track this instance's place in the shared overlay stack so its keydown
  // handling below can stay silent while a dialog opened on top of it (e.g.
  // a ConfirmDialog opened from this Modal) is the one that should respond.
  useEffect(() => {
    if (!open) return;
    const id = pushOverlay();
    overlayIdRef.current = id;
    return () => {
      popOverlay(id);
      overlayIdRef.current = null;
    };
  }, [open]);

  // Close on Escape & focus trap
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!overlayIdRef.current || !isTopOverlay(overlayIdRef.current)) return;
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

  // Focus first focusable element on open
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) focusable[0].focus();
    });
  }, [open, getFocusableElements]);

  // Prevent body scroll when open — ref-counted so a nested overlay
  // (e.g. this Modal opened from within an open Drawer) doesn't unlock the
  // body out from under the other one when it closes first.
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ animation: "fade-in 150ms ease-out" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      {/* Content */}
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-card relative mx-4 w-full max-w-lg p-6 shadow-xl"
        style={{ animation: "scale-in 200ms var(--ease-spring)" }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
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
        {/* Body */}
        <div className="space-y-4">{children}</div>
        {/* Footer */}
        {footer && <div className="mt-6 flex justify-end gap-3 border-t border-border-subtle pt-4">{footer}</div>}
      </div>
    </div>
  );
}
