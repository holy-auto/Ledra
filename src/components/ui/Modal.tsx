"use client";

import { useRef, type ReactNode } from "react";

import useDialogA11y from "./useDialogA11y";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useDialogA11y(open, onClose, contentRef);

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
