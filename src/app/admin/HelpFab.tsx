"use client";

import { useState } from "react";
import HelpDrawer from "./HelpDrawer";

/**
 * 画面右下の浮遊ヘルプボタン (Floating Action Button)。
 * クリックすると操作ガイドのドロワーが開く。
 * /admin 配下のすべてのページで利用可能。
 */
export default function HelpFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB本体 — ドロワーが開いている間は非表示にして二重トリガーを避ける */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="操作ガイドを開く"
          title="操作ガイドを開く"
          className="fixed bottom-20 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl lg:bottom-5"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      )}
      <HelpDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
