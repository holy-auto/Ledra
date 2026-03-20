"use client";

import { useState } from "react";
import Link from "next/link";

export function MobileMenu({
  navItems,
}: {
  navItems: { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-white/60"
        aria-label="メニューを開く"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-[#060a12]">
          <div className="flex items-center justify-between h-16 px-5">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-white"
              onClick={() => setOpen(false)}
            >
              CARTRUST
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="p-2 text-white/60"
              aria-label="メニューを閉じる"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-6 px-8 pt-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-lg font-medium text-white/70 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="text-lg font-medium text-white/55 hover:text-white transition-colors"
              onClick={() => setOpen(false)}
            >
              ログイン
            </Link>
            <Link
              href="/signup"
              className="mt-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-base font-medium px-6 py-3 rounded-lg text-center hover:from-blue-500 hover:to-blue-400 transition-all shadow-[0_1px_12px_rgba(59,130,246,0.3)]"
              onClick={() => setOpen(false)}
            >
              無料で始める
            </Link>
            <Link
              href="/contact"
              className="text-white text-base font-medium px-6 py-3 rounded-lg text-center border border-white/20 hover:bg-white/10 transition-colors"
              onClick={() => setOpen(false)}
            >
              お問い合わせ
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
