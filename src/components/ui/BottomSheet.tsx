"use client";

import { useRef, type ReactNode } from "react";
import IconButton from "@/components/ui/IconButton";
import useDialogA11y from "@/components/ui/useDialogA11y";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * 画面下から出るシート(Compact レイアウトの標準サーフェス、v2.0 §4.1)。
 * Drawer(右パネル)のモバイル代替。z-50 は MobileTabBar(z-20)/サイドバー(z-30/40)より
 * 上のモーダル層(MobileTabBar.tsx の z-index 契約)。safe-area 下端を尊重する。
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: "fade-in 150ms ease-out" }}
      />
      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto border-t border-border-default bg-[var(--bg-surface-solid)] pb-[env(safe-area-inset-bottom)] shadow-xl"
        style={{
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          animation: "slide-in-bottom 300ms var(--ease-out)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* グラブハンドル(装飾) */}
        <div aria-hidden="true" className="flex justify-center pt-2">
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-[var(--bg-surface-solid)] px-5 py-3">
          <h2 className="text-base font-semibold text-primary">{title}</h2>
          <IconButton onClick={onClose} aria-label="閉じる">
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
          </IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
