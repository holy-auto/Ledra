"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminCommandItems, type AdminCommand } from "@/components/ui/Sidebar";
import { QUICK_CREATE_ACTIONS, inferCreateContext, applyCreateContext } from "@/lib/navigation/quickCreate";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import type { EntitySearchResults } from "@/lib/search/entities";

// ── コマンドと Quick Create の静的リスト ──

const PAGE_COMMANDS: AdminCommand[] = adminCommandItems();

/**
 * v2.0 §4 / IMP-020: CommandPalette にエンティティ検索 + Quick Create を統合。
 *
 * 3 セクション構成:
 * 1. 新規作成（Quick Create — コンテキスト継承付き）
 * 2. ページ移動（既存の NAV_GROUPS ベース）
 * 3. 検索結果（エンティティ検索 — 顧客/車両/証明書/請求書）
 *
 * ponytail: エンティティ検索は /api/admin/search を呼ぶ（サーバ側でテナント分離済み）。
 * 入力 300ms 後にデバウンスして発火。既存の searchEntities はサーバ側なので、
 * ここではクライアントから API を叩く。
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [entityResults, setEntityResults] = useState<AdminCommand[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const { can, role, loading: roleLoading } = useCurrentRole();

  // ── Quick Create アクション（権限ゲート + コンテキスト継承） ──
  const createContext = inferCreateContext(pathname);
  const quickCreateCommands: AdminCommand[] = QUICK_CREATE_ACTIONS.filter(
    (a) => roleLoading || !role || can(a.permission),
  ).map((a) => ({
    label: a.label,
    href: applyCreateContext(a.href, createContext),
    section: a.section,
  }));

  // ── フィルタリング ──
  const filteredPages = query
    ? PAGE_COMMANDS.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) || cmd.href.toLowerCase().includes(query.toLowerCase()),
      )
    : PAGE_COMMANDS;

  const filteredCreate = query
    ? quickCreateCommands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()))
    : quickCreateCommands;

  // ── 結合リスト ──
  // ponytail: entityResults はデバウンス後に届くので、現在の query と齟齬がありうる。
  // 簡易フィルタで古い結果が残らないようにする。
  const filteredEntities = query
    ? entityResults.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()))
    : entityResults;
  const allCommands = [...filteredCreate, ...filteredPages, ...filteredEntities];

  // Group by section
  const grouped = allCommands.reduce<Record<string, AdminCommand[]>>((acc, cmd) => {
    if (!acc[cmd.section]) acc[cmd.section] = [];
    acc[cmd.section].push(cmd);
    return acc;
  }, {});

  // Flat list for keyboard navigation
  const flatList = Object.values(grouped).flat();

  // ── エンティティ検索（デバウンス 300ms） ──
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (query.length < 2) {
      setEntityResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}&limit=5`, {
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) {
          if (!controller.signal.aborted) setEntityResults([]);
          setSearching(false);
          return;
        }
        const data: EntitySearchResults = await res.json();
        // ponytail: entityResultsToChips()（src/lib/search/entities.ts）と同種の
        // フィールド抽出を手で再実装している。あちらは section 無しの EntityChip
        // （ラベルに「（顧客）」等を埋め込む）、こちらは CommandPalette 用に
        // section 別に出したいので型が合わず、そのまま流用していない。
        // 2つのマッピングが将来ズレる可能性がある — 直すなら entityResultsToChips
        // 側を「生のフィールド」を返す形に分解し、ラベル整形は呼び出し側に委ねる。
        const chips: AdminCommand[] = [];

        for (const c of data.customers) {
          chips.push({
            label: `${c.name ?? "（無名）"}`,
            href: `/admin/customers/${c.id}`,
            section: "顧客",
          });
        }
        for (const v of data.vehicles) {
          const bits = [v.maker, v.model].filter(Boolean).join(" ");
          const ident = v.plate_number || v.vin || "";
          chips.push({
            label: `${bits || "車両"}${ident ? ` ${ident}` : ""}`,
            href: `/admin/vehicles/${v.id}`,
            section: "車両",
          });
        }
        for (const cert of data.certificates) {
          chips.push({
            label: `${cert.public_id}${cert.customer_name ? ` ・ ${cert.customer_name}` : ""}`,
            href: `/admin/certificates/${cert.public_id}`,
            section: "証明書",
          });
        }
        for (const inv of data.invoices) {
          chips.push({
            label: `${inv.invoice_number ?? ""}${inv.customer_name ? ` ・ ${inv.customer_name}` : ""}`.trim(),
            href: `/admin/invoices/${inv.id}`,
            section: "請求書",
          });
        }

        if (!controller.signal.aborted) {
          setEntityResults(chips);
          setSearching(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setEntityResults([]);
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // ── ショートカット ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
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
      setEntityResults([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // ponytail: クリーンアップ — 閉じたら検索中止
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  // Reset active index when query or results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query, entityResults.length]);

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
        setActiveIndex((i) => (i + 1) % (flatList.length || 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + (flatList.length || 1)) % (flatList.length || 1));
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
            placeholder="ページ・顧客・車両・証明書を検索、または新規作成..."
            className="flex-1 bg-transparent text-primary placeholder:text-muted outline-none text-sm"
          />
          {searching && <span className="text-[11px] text-muted animate-pulse">検索中...</span>}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border-subtle bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] text-muted font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {flatList.length === 0 && !searching ? (
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
                      key={`${cmd.section}-${cmd.href}`}
                      data-active={isActive}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                        isActive ? "bg-surface-hover text-primary" : "text-secondary hover:bg-surface-hover/50"
                      }`}
                      onClick={() => navigate(cmd.href)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="flex-1 truncate">{cmd.label}</span>
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
