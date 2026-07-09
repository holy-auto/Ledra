"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// Quick-access items for admin portal
const COMMANDS = [
  { label: "ダッシュボード", href: "/admin", section: "ページ" },
  { label: "証明書一覧", href: "/admin/certificates", section: "ページ" },
  { label: "新規証明書発行", href: "/admin/certificates/new", section: "アクション" },
  { label: "車両管理", href: "/admin/vehicles", section: "ページ" },
  { label: "顧客管理", href: "/admin/customers", section: "ページ" },
  { label: "予約管理", href: "/admin/reservations", section: "ページ" },
  { label: "請求・帳票", href: "/admin/invoices", section: "ページ" },
  { label: "Square売上", href: "/admin/square", section: "ページ" },
  { label: "経営分析", href: "/admin/management", section: "ページ" },
  { label: "BtoBプラットフォーム", href: "/admin/btob", section: "ページ" },
  { label: "案件受発注", href: "/admin/orders", section: "ページ" },
  { label: "ヒアリング", href: "/admin/hearing", section: "ページ" },
  { label: "品目マスタ", href: "/admin/menu-items", section: "ページ" },
  { label: "NFC管理", href: "/admin/nfc", section: "ページ" },
  { label: "お知らせ", href: "/admin/announcements", section: "ページ" },
  { label: "店舗設定", href: "/admin/settings", section: "設定" },
  { label: "メンバー管理", href: "/admin/members", section: "設定" },
  { label: "ブランド証明書", href: "/admin/template-options", section: "設定" },
  { label: "ロゴ・角印設定", href: "/admin/settings", section: "設定" },
  { label: "請求・プラン", href: "/admin/billing", section: "設定" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Filter commands based on query
  const filtered = query
    ? COMMANDS.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) || cmd.href.toLowerCase().includes(query.toLowerCase()),
      )
    : COMMANDS;

  // Group by section
  const grouped = filtered.reduce<Record<string, typeof COMMANDS>>((acc, cmd) => {
    if (!acc[cmd.section]) acc[cmd.section] = [];
    acc[cmd.section].push(cmd);
    return acc;
  }, {});

  // Flat list for keyboard navigation
  const flatList = Object.values(grouped).flat();

  // Open/close with Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    // グローバルバーの検索ボタンなど、UI からの起動用イベント。
    const handleOpen = () => setOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-command-palette", handleOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-command-palette", handleOpen);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatList.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flatList.length) % flatList.length);
        break;
      case "Enter":
        e.preventDefault();
        if (flatList[activeIndex]) {
          navigate(flatList[activeIndex].href);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  if (!open) return null;

  let itemCounter = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[var(--bg-elevated)] border border-border-subtle shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <svg className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ページやアクションを検索..."
            className="flex-1 bg-transparent text-primary placeholder:text-muted outline-none text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border-subtle bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] text-muted font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {flatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">該当する項目がありません</div>
          ) : (
            Object.entries(grouped).map(([section, items]) => (
              <div key={section} className="mb-2 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] font-medium text-muted uppercase tracking-wider">{section}</div>
                {items.map((cmd) => {
                  const index = itemCounter++;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={cmd.href}
                      data-active={isActive}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                        isActive ? "bg-surface-hover text-primary" : "text-secondary hover:bg-surface-hover/50"
                      }`}
                      onClick={() => navigate(cmd.href)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="flex-1">{cmd.label}</span>
                      {isActive && <span className="text-[11px] text-muted">↵</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border-subtle bg-[var(--bg-surface)] px-1 py-0.5 font-mono">↑↓</kbd>
              移動
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border-subtle bg-[var(--bg-surface)] px-1 py-0.5 font-mono">↵</kbd>
              開く
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border-subtle bg-[var(--bg-surface)] px-1 py-0.5 font-mono">⌘K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
