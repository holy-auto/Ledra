"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { adminSectionLabel } from "@/components/ui/Sidebar";

/**
 * L字シェルの「細いグローバルバー」。サイドバー意匠に続く二段目のバーで、
 * 左にパンくず・右に ⌘K 検索を置く。各ページ既存のヘッダ (H1) はそのまま活き、
 * このバーは全 /admin 画面に一括で載る横断チップとして機能する。
 *
 * パンくずのラベルは Sidebar の NAV を単一の出典として共有する
 * (adminSectionLabel)。ラベルの二重管理を避けるため独自マップは持たない。
 */
export default function AdminTopBar() {
  const pathname = usePathname();
  const section = adminSectionLabel(pathname);

  // ⌘ (mac) / Ctrl (その他) はマウント後に判定してハイドレーション不一致を避ける。
  const [modKey, setModKey] = useState<string | null>(null);
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    setModKey(isMac ? "⌘" : "Ctrl");
  }, []);

  const openSearch = () => window.dispatchEvent(new Event("open-command-palette"));

  return (
    <div className="sticky top-0 z-20 flex h-11 flex-shrink-0 items-center gap-3 border-b border-border-default bg-base pl-16 pr-4 sm:pr-6 lg:pl-6">
      {/* パンくず（モバイルではハンバーガーと干渉するため非表示） */}
      <nav aria-label="パンくず" className="hidden min-w-0 items-center gap-1.5 text-[13px] lg:flex">
        <Link href="/admin" className="text-muted transition-colors hover:text-primary">
          管理
        </Link>
        {section && (
          <>
            <span className="text-muted" aria-hidden>
              ›
            </span>
            <span className="truncate font-medium text-primary">{section}</span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* ⌘K 検索トリガー（既存 CommandPalette を起動） */}
      <button
        type="button"
        onClick={openSearch}
        aria-label="検索 (コマンドパレット)"
        className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border-default px-2.5 py-1.5 text-[13px] text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <span className="hidden sm:inline">検索</span>
        {modKey && (
          <kbd className="hidden rounded border border-border-default px-1.5 py-0.5 font-mono text-[10.5px] text-muted sm:inline">
            {modKey}K
          </kbd>
        )}
      </button>
    </div>
  );
}
