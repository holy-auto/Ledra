"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { adminSectionLabel } from "@/components/ui/Sidebar";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import NotificationBell from "@/components/ui/NotificationBell";

/**
 * L字シェルの「細いグローバルバー」。サイドバー意匠に続く二段目のバーで、
 * 左に「店名 › セクション」のパンくず、右に幅広検索・通知・ユーザーアバターを置く。
 * 各ページ既存のヘッダ (H1) はそのまま活き、このバーは全 /admin 画面へ一括で載る。
 *
 * パンくずのセクションラベルは Sidebar の NAV を単一の出典として共有する
 * (adminSectionLabel)。店名は現在ユーザーの tenant_name を用いる。
 */
export default function AdminTopBar() {
  const pathname = usePathname();
  const section = adminSectionLabel(pathname);
  const { data } = useCurrentRole();
  const workspace = data?.tenant_name || "管理";
  const avatarChar = (data?.email || "?").trim().charAt(0).toUpperCase() || "?";

  // ⌘ (mac) / Ctrl (その他) はマウント後に判定してハイドレーション不一致を避ける。
  const [modKey, setModKey] = useState<string | null>(null);
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    setModKey(isMac ? "⌘" : "Ctrl");
  }, []);

  const openSearch = () => window.dispatchEvent(new Event("open-command-palette"));

  return (
    <div className="sticky top-0 z-20 flex h-11 flex-shrink-0 items-center gap-3 border-b border-border-default bg-base pr-3 pl-16 sm:pr-4 lg:pl-6">
      {/* パンくず（モバイルではハンバーガーと干渉するため非表示） */}
      <nav aria-label="パンくず" className="hidden min-w-0 items-center gap-1.5 text-[13px] lg:flex">
        <Link href="/admin" className="truncate text-secondary transition-colors hover:text-primary">
          {workspace}
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

      {/* 幅広検索ピル（既存 CommandPalette を起動）。モバイルはアイコンのみ。 */}
      <button
        type="button"
        onClick={openSearch}
        aria-label="検索 (コマンドパレット)"
        className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border-default px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-hover hover:text-primary sm:min-w-[240px]"
      >
        <svg
          width="15"
          height="15"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
          className="shrink-0"
        >
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <span className="hidden sm:inline">検索・顧客 / 車両 / 証明書 ID</span>
        {modKey && (
          <kbd className="ml-auto hidden rounded border border-border-default px-1.5 py-0.5 font-mono text-[10.5px] text-muted sm:inline">
            {modKey}K
          </kbd>
        )}
      </button>

      <NotificationBell />

      {/* ユーザーアバター（メールの頭文字）。設定へのリンク。 */}
      <Link
        href="/admin/settings"
        aria-label="アカウント設定"
        className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-inverse sm:inline-flex"
      >
        {avatarChar}
      </Link>
    </div>
  );
}
