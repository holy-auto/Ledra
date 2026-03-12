"use client";

import Link from "next/link";
import { useState } from "react";
import { siteConfig, marketingNav } from "@/lib/marketing/config";

export function MarketingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* ロゴ */}
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-zinc-900"
        >
          {siteConfig.siteName}
        </Link>

        {/* デスクトップ ナビゲーション */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="メインナビゲーション">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* デスクトップ CTA */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href={siteConfig.loginUrl}
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            ログイン
          </Link>
          <Link
            href="/contact"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            無料で試す
          </Link>
        </div>

        {/* モバイル メニューボタン */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 2L14 14M14 2L2 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 4H14M2 8H14M2 12H14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* モバイル メニュー */}
      {isMenuOpen && (
        <div className="border-t border-zinc-100 bg-white px-6 py-5 md:hidden">
          <nav className="flex flex-col gap-5" aria-label="モバイルナビゲーション">
            {marketingNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-zinc-600 hover:text-zinc-900"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 flex flex-col gap-3 border-t border-zinc-100 pt-5">
            <Link
              href={siteConfig.loginUrl}
              className="text-sm text-zinc-500 hover:text-zinc-900"
              onClick={() => setIsMenuOpen(false)}
            >
              ログイン
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              無料で試す
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
