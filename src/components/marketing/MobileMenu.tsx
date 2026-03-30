"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export function MobileMenu({
  navItems,
  portalItems,
}: {
  navItems: { label: string; href: string }[];
  portalItems: { label: string; href: string; description: string }[];
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

      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-[#060a12]">
          <div className="flex items-center justify-between h-16 px-5">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-white"
              onClick={() => setOpen(false)}
            >
              Ledra
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

          <nav className="flex flex-col gap-1 px-5 pt-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-lg font-medium text-white/70 hover:text-white px-3 py-3 rounded-lg hover:bg-white/[0.06] transition-colors"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            {/* Portal login section */}
            <div className="mt-4 pt-4 border-t border-white/[0.08]">
              <p className="px-3 text-xs font-medium text-white/30 uppercase tracking-wider mb-2">
                ポータルログイン
              </p>
              {portalItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-white/[0.06] transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <div>
                    <span className="text-base font-medium text-white/80">{item.label}</span>
                    <span className="block text-xs text-white/35 mt-0.5">{item.description}</span>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-white/30">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
              <Link
                href="/signup"
                className="block bg-gradient-to-r from-blue-600 to-blue-500 text-white text-base font-medium px-6 py-3 rounded-lg text-center hover:from-blue-500 hover:to-blue-400 transition-all shadow-[0_1px_12px_rgba(59,130,246,0.3)]"
                onClick={() => setOpen(false)}
              >
                無料で始める
              </Link>
              <Link
                href="/contact"
                className="block text-white text-base font-medium px-6 py-3 rounded-lg text-center border border-white/20 hover:bg-white/10 transition-colors"
                onClick={() => setOpen(false)}
              >
                お問い合わせ
              </Link>
            </div>
          </nav>
        </div>,
        document.body
      )}
    </div>
  );
}
