"use client";

import { useRef, type ReactNode } from "react";

import useDialogA11y from "./useDialogA11y";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogA11y(open, onClose, panelRef);

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
