"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { type Permission } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { FEATURE_BY_HREF, isAdvancedFeatureVisible, isVisibleInBusinessMode } from "@/lib/features/catalog";
import { useFeaturePrefs } from "@/lib/features/useFeaturePrefs";
import StoreSelector from "@/components/ui/StoreSelector";
import ThemeToggle from "@/lib/theme/ThemeToggle";
import SidebarShell from "@/components/ui/SidebarShell";
import ContextSwitcher from "@/components/ui/ContextSwitcher";
import ViewModeToggle from "@/components/ui/ViewModeToggle";
import BusinessModeToggle from "@/components/ui/BusinessModeToggle";
import { useBusinessMode } from "@/lib/business-mode/BusinessModeContext";
import {
  NAV_GROUPS,
  CORE_HREFS,
  STORAGE_KEY,
  PINS_KEY,
  computeInitialGroupState,
  ADMIN_NAV_LABELS,
  adminCommandItems,
  adminSectionLabel,
  type NavItem,
  type NavGroup,
  type AdminCommand,
} from "./adminNav";

// 外部（クライアント）importer 互換のため、従来 Sidebar から出していた API を再エクスポート。
// 単一の出典は adminNav（サーバー/クライアント両用）。
export { NAV_GROUPS, CORE_HREFS, computeInitialGroupState, ADMIN_NAV_LABELS, adminCommandItems, adminSectionLabel };
export type { NavItem, NavGroup, AdminCommand };

/* ------------------------------------------------------------------ */
/*  Badge counts hook                                                  */
/* ------------------------------------------------------------------ */
type BadgeCounts = Record<string, number>;

function useSidebarBadges(intervalMs = 60_000): BadgeCounts {
  const [badges, setBadges] = useState<BadgeCounts>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sidebar-badges");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.ok) return;
      const next: BadgeCounts = {};
      if (json.reservations_today > 0) next.reservations_today = json.reservations_today;
      if (json.square_unlinked > 0) next.square_unlinked = json.square_unlinked;
      if (json.messages_unread > 0) next.messages_unread = json.messages_unread;
      if (json.pending_approvals > 0) next.pending_approvals = json.pending_approvals;
      setBadges(next);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    // Delay initial fetch by 3 s so badge API doesn't compete with the page's
    // own data requests on mount (prevents TTFB / INP regression).
    const initTimer = setTimeout(() => {
      fetchBadges();
      timerRef.current = setInterval(fetchBadges, intervalMs);
    }, 3_000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        fetchBadges();
        timerRef.current = setInterval(fetchBadges, intervalMs);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearTimeout(initTimer);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchBadges, intervalMs]);

  return badges;
}

/* ------------------------------------------------------------------ */
/*  Badge component                                                    */
/* ------------------------------------------------------------------ */
function NavBadge({ count, gold = false, attention = false }: { count: number; gold?: boolean; attention?: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  // 通常はアラート性を示す赤。ゴールド項目（証明書など上位機能）は格上げのゴールド。
  // attention（承認インボックス = AI の人手承認待ち）は「対応が必要」を表す琥珀。
  const bg = attention ? "bg-amber-500" : gold ? "bg-accent-gold" : "bg-red-500";
  return (
    <span
      className={`ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white ${bg}`}
    >
      {label}
    </span>
  );
}

/** Detect mobile viewport (matches lg breakpoint) */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

/** Read persisted group open/close state from localStorage */
function loadGroupState(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function saveGroupState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Read persisted pinned hrefs from localStorage (defensive: only string[]). */
function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((h): h is string => typeof h === "string");
    }
  } catch {
    /* ignore */
  }
  return [];
}

function savePins(pins: string[]) {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Collapsible Group Component                                       */
/* ------------------------------------------------------------------ */
function CollapsibleGroup({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  // Pure-CSS accordion via grid-template-rows: 0fr ↔ 1fr.
  // Eliminates scrollHeight forced-layout reads and double-rAF calls that
  // caused layout thrash on mobile (5 groups × measure + collapse = ~10 rAFs).
  return (
    <div className="mt-2 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
      >
        <svg
          width="12"
          height="12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        {label}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="space-y-0.5 pt-0.5">{children}</ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                           */
/* ------------------------------------------------------------------ */
export default function Sidebar() {
  const pathname = usePathname();
  const { data, role, can, loading, isPlatformAdmin, isOrgUser } = useCurrentRole();
  // ワークスペースカードのアバター用イニシャル（テナント名の先頭最大2文字）。
  const workspaceInitials = (data?.tenant_name || "").replace(/\s+/g, "").slice(0, 2).toUpperCase();
  const { tenantDisabled, userVisible, loading: prefsLoading } = useFeaturePrefs();
  const tenantDisabledSet = useMemo(() => new Set(tenantDisabled), [tenantDisabled]);
  const userVisibleSet = useMemo(() => new Set(userVisible), [userVisible]);
  const { mode: businessMode, hydrated: businessModeHydrated } = useBusinessMode();
  const isMobile = useIsMobile();
  const badges = useSidebarBadges();

  // Group open/close state -------------------------------------------------
  const [groupState, setGroupState] = useState<Record<string, boolean>>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const persisted = loadGroupState();
    if (persisted) {
      // On mobile first visit, collapse all; otherwise use persisted
      if (isMobile) {
        const allClosed: Record<string, boolean> = {};
        NAV_GROUPS.forEach((g) => {
          if (g.label) allClosed[g.label] = persisted[g.label] ?? false;
        });
        setGroupState(allClosed);
      } else {
        setGroupState(persisted);
      }
    } else {
      // First visit: desktop = each group's defaultOpen (default true), mobile = all closed
      setGroupState(computeInitialGroupState(NAV_GROUPS, isMobile));
    }
  }, [isMobile]);

  const toggleGroup = useCallback((label: string) => {
    setGroupState((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      saveGroupState(next);
      return next;
    });
  }, []);

  // Slim (コア + ピン) / Full (全機能) の表示切替。既定は slim。セッション内のみ保持。
  const [showAll, setShowAll] = useState(false);

  // ピン留め状態 -----------------------------------------------------------
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => setPins(loadPins()), []);
  const pinSet = useMemo(() => new Set(pins), [pins]);
  const togglePin = useCallback((href: string) => {
    setPins((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      savePins(next);
      return next;
    });
  }, []);

  // href → NavItem 索引（NAV_GROUPS が単一の出典。ラベル/アイコン/バッジを再利用）。
  const itemByHref = useMemo(() => {
    const m = new Map<string, NavItem>();
    for (const g of NAV_GROUPS) for (const it of g.items) if (!m.has(it.href)) m.set(it.href, it);
    return m;
  }, []);
  const coreItems = useMemo(
    () => CORE_HREFS.map((h) => itemByHref.get(h)).filter((x): x is NavItem => !!x),
    [itemByHref],
  );
  const pinnedItems = useMemo(
    () =>
      pins
        .filter((h) => !CORE_HREFS.includes(h))
        .map((h) => itemByHref.get(h))
        .filter((x): x is NavItem => !!x),
    [pins, itemByHref],
  );

  // Filter visible items per group
  const filterItems = useCallback(
    (items: NavItem[]) =>
      items.filter((item) => {
        if (item.hidden) return false;

        // 設定・マスタ系 (hub) は歯車から開く設定ハブに集約。サイドバーには出さない。
        if (item.hub) return false;

        // Strict platform-only gate: hide unless verified as platform admin.
        // No optimistic display — contractors must never see these links.
        if (item.platformOnly && !isPlatformAdmin) return false;

        // 本社専用ユーザ (tenant role 無し): 本社向け項目のみ表示する。
        // role が永続的に null のため、下の楽観的ゲートだと全項目が出てしまう。
        if (isOrgUser && !role) {
          return item.orgUserVisible === true;
        }

        // Existing role/permission gate (optimistic while the role loads).
        if (item.requiredPermission && !loading && role && !can(item.requiredPermission)) {
          return false;
        }

        // Advanced-feature gate: hidden by default, shown only when the
        // tenant allows it AND the user opted it into their sidebar.
        const def = FEATURE_BY_HREF.get(item.href);
        if (def?.tier === "advanced") {
          if (prefsLoading) return false;
          if (!isAdvancedFeatureVisible(def.key, tenantDisabledSet, userVisibleSet)) {
            return false;
          }
        }

        // 業種別モードによる絞り込み: businessModes 未タグの項目は共通機能として
        // 常時表示。タグ済みの項目は選択中モードに含まれる時だけ表示する。
        // hydrated 前は localStorage の実値が未確定なので絞り込まない
        // (前回選んだモードに応じて項目が消えるフラッシュを防ぐ)。
        const effectiveMode = !businessModeHydrated || businessMode === "all" ? null : businessMode;
        if (!isVisibleInBusinessMode(item.href, effectiveMode)) {
          return false;
        }

        return true;
      }),
    [
      loading,
      role,
      can,
      isPlatformAdmin,
      isOrgUser,
      prefsLoading,
      tenantDisabledSet,
      userVisibleSet,
      businessMode,
      businessModeHydrated,
    ],
  );

  const renderItem = (item: NavItem, opts?: { pinnable?: boolean }) => {
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

    const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
    const pinned = pinSet.has(item.href);

    // L字シェル: アクティブ項目は面 (サイドバー) から一段沈めたピルで表す
    // (bg-base + インセットリング)。アクセントはアイコンと右端ドットに集約し、
    // 証明書などゴールド項目のみ格上げしてゴールドで見せる。
    const accentText = item.gold ? "text-accent-gold" : "text-accent";
    const dotBg = item.gold ? "bg-accent-gold" : "bg-accent";
    // attention（承認インボックス）で承認待ちがある時は、AI 自動化の「人の確認が必要」
    // を琥珀で常時可視化する（アクティブでなくてもアイコンを色付け・左に琥珀ライン）。
    const needsAttention = item.attention && badgeCount > 0;

    return (
      <li key={item.href} className={opts?.pinnable ? "group relative" : undefined}>
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          data-tour={item.dataTour}
          className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] transition-all duration-150 ${
            isActive
              ? "bg-base font-medium text-primary shadow-[inset_0_0_0_1px_var(--border-default)]"
              : needsAttention
                ? "font-medium text-primary shadow-[inset_2px_0_0_0_#f59e0b] hover:bg-surface-hover"
                : "font-normal text-secondary hover:bg-surface-hover hover:text-primary"
          }`}
        >
          <span className={needsAttention ? "text-amber-500" : isActive ? accentText : "text-muted"}>{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
          {badgeCount > 0 ? (
            <NavBadge count={badgeCount} gold={item.gold} attention={item.attention} />
          ) : isActive ? (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotBg}`} />
          ) : null}
        </Link>
        {/* ピン留めトグル。ponytail: 行の右端（バッジ/ドット位置）に重ねる。ピン済みは常時表示。
            未ピンは、ポインタ環境では hover で出す。タッチ端末（hover 不可）では常時表示にし、
            キーボード操作では focus-visible で出す（見えない control を tab で踏むのを防ぐ）。
            コア項目は常時表示のためピン留めしても意味が無く、ボタンを出さない。 */}
        {opts?.pinnable && !CORE_HREFS.includes(item.href) && (
          <button
            type="button"
            aria-label={pinned ? `${item.label}のピン留めを解除` : `${item.label}をピン留め`}
            aria-pressed={pinned}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePin(item.href);
            }}
            className={`absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] p-1 transition-opacity hover:bg-surface-hover ${
              pinned
                ? "text-accent opacity-100"
                : `text-muted group-hover:opacity-100 focus-visible:opacity-100 ${isMobile ? "opacity-100" : "opacity-0"}`
            }`}
          >
            <svg
              width="14"
              height="14"
              fill={pinned ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z M12 15v5" />
            </svg>
          </button>
        )}
      </li>
    );
  };

  return (
    <SidebarShell hamburgerAlign="right">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border-subtle px-5">
        <Image src="/icon-192.png" alt="Ledra" width={28} height={28} className="rounded-lg" />
        <span className="text-[13px] font-semibold tracking-wide text-primary">Ledra</span>
        <div className="ml-auto flex items-center gap-2">
          {/* 施工店・代理店 両方の権限を持つ場合のみ表示されるモード切替 */}
          <ContextSwitcher />
        </div>
      </div>

      {/* ワークスペースカード（現在のテナント / 役割）— L字シェル意匠 */}
      {data?.tenant_name && (
        <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--border-default)]">
          <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary font-mono text-[11px] font-semibold text-inverse">
            {workspaceInitials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-primary">{data.tenant_name}</span>
            {role && <span className="block truncate text-[10.5px] text-muted">{ROLE_LABELS[role]}</span>}
          </span>
        </div>
      )}

      {/* View Mode Toggle (店頭 / 管理) */}
      <div
        data-tour="view-mode-toggle"
        className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">モード</span>
        <ViewModeToggle />
      </div>

      {/* Business Mode Toggle (整備 / 鈑金塗装 / コーティング / PPF) */}
      <div
        data-tour="business-mode-toggle"
        className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">業種</span>
        <BusinessModeToggle />
      </div>

      {/* Store Selector */}
      <StoreSelector />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {/* AIチャット入口: 自由文で目的の画面を開く。Cmd+K パレットは併存
            （AdminTopBar の検索ピルから起動）。ロジックは重複させず event で起動。 */}
        <button
          type="button"
          data-tour="assistant-chat"
          onClick={() => window.dispatchEvent(new Event("open-assistant-chat"))}
          className="mb-2 flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--border-default)] transition-colors hover:bg-surface-hover hover:text-primary"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"
            />
          </svg>
          <span className="flex-1 text-left">AIに聞いて画面を開く</span>
        </button>

        {showAll ? (
          /* Full: 既存の全 NAV_GROUPS を表示（何も失わない退避路）。各項目はピン留め可能。 */
          NAV_GROUPS.map((group) => {
            const visibleItems = filterItems(group.items);
            if (visibleItems.length === 0) return null;

            // Main group (no label) — always visible, not collapsible
            if (!group.label) {
              return (
                <ul key="__main" className="space-y-0.5">
                  {visibleItems.map((it) => renderItem(it, { pinnable: true }))}
                </ul>
              );
            }

            // Collapsible group
            const isOpen = groupState[group.label] ?? group.defaultOpen ?? true;
            return (
              <CollapsibleGroup
                key={group.label}
                label={group.label}
                isOpen={isOpen}
                onToggle={() => toggleGroup(group.label)}
              >
                {visibleItems.map((it) => renderItem(it, { pinnable: true }))}
              </CollapsibleGroup>
            );
          })
        ) : (
          /* Slim: メイン（ダッシュボード + 承認インボックス）→ コア → ピン留め。
             それぞれ既存 filterItems を通すので RBAC/プラン/業種ゲートは維持される。 */
          <>
            {isOrgUser && !role ? (
              /* 本社専用ユーザ: core/main には orgUserVisible 項目が無く slim が空になり、
                 毎回「すべての機能を表示」を開かせることになる。全グループから本社向けリンクを
                 集約して表示する（filterItems が orgUserVisible に限定するのでゲートは維持）。 */
              (() => {
                const seen = new Set<string>();
                const items = filterItems(NAV_GROUPS.flatMap((g) => g.items)).filter(
                  (it) => !seen.has(it.href) && seen.add(it.href),
                );
                return items.length ? (
                  <ul className="space-y-0.5">{items.map((it) => renderItem(it, { pinnable: true }))}</ul>
                ) : null;
              })()
            ) : (
              <>
                {(() => {
                  const mainGroup = NAV_GROUPS.find((g) => !g.label);
                  const items = mainGroup ? filterItems(mainGroup.items) : [];
                  return items.length ? <ul className="space-y-0.5">{items.map((it) => renderItem(it))}</ul> : null;
                })()}

                {(() => {
                  const items = filterItems(coreItems);
                  return items.length ? (
                    <ul className="mt-1 space-y-0.5">{items.map((it) => renderItem(it, { pinnable: true }))}</ul>
                  ) : null;
                })()}

                {(() => {
                  const items = filterItems(pinnedItems);
                  if (!items.length) return null;
                  return (
                    <div className="mt-2">
                      <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        ピン留め
                      </div>
                      <ul className="space-y-0.5">{items.map((it) => renderItem(it, { pinnable: true }))}</ul>
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* Slim ↔ Full 切替 */}
        <button
          type="button"
          data-tour="all-features-toggle"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
        >
          <svg
            width="12"
            height="12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            className={`shrink-0 transition-transform duration-200 ${showAll ? "rotate-90" : "rotate-0"}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          {showAll ? "コア表示に戻す" : "すべての機能を表示"}
        </button>
      </nav>

      {/* Footer */}
      <div className="border-t border-border-subtle px-3 py-3">
        <Link
          href="/admin/support"
          aria-current={pathname === "/admin/support" ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 mb-1 ${
            pathname === "/admin/support"
              ? "bg-base text-primary shadow-[inset_0_0_0_1px_var(--border-default)]"
              : "text-muted hover:bg-surface-hover hover:text-primary"
          }`}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
          サポート
        </Link>
        <Link
          href="/admin/settings/features"
          data-tour="customize-features"
          aria-current={pathname === "/admin/settings/features" ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 mb-1 ${
            pathname === "/admin/settings/features"
              ? "bg-base text-primary shadow-[inset_0_0_0_1px_var(--border-default)]"
              : "text-muted hover:bg-surface-hover hover:text-primary"
          }`}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
            />
          </svg>
          機能をカスタマイズ
        </Link>
        <div className="mb-2 px-2.5">
          <ThemeToggle />
        </div>
        {/* ユーザーカード（アバター + メール + 役割 + 設定 / ログアウト）— L字シェル意匠 */}
        <div className="mt-1 flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--border-default)]">
          <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-inverse">
            {(data?.email || "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12px] font-medium text-primary">{data?.email ?? "—"}</span>
            {role && <span className="block truncate text-[10.5px] text-muted">{ROLE_LABELS[role]}</span>}
          </span>
          <Link
            href="/admin/settings"
            aria-label="設定・マスタ"
            data-tour="settings-gear"
            className="inline-flex flex-shrink-0 rounded-[var(--radius-sm)] p-1 text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <button
            type="button"
            aria-label="ログアウト"
            onClick={async () => {
              try {
                const { createClient } = await import("@/lib/supabase/client");
                const supabase = createClient();
                await supabase.auth.signOut();
                try {
                  sessionStorage.clear();
                } catch {
                  /* ignore */
                }
                // 同一ブラウザでユーザ切替する運用に備え、SW のオフライン読み取り
                // キャッシュ (HTML / API) を破棄する。失敗してもログアウト自体は続行。
                try {
                  const { clearOfflineReadCache } = await import("@/lib/offline-cache/client");
                  await clearOfflineReadCache();
                } catch {
                  /* ignore */
                }
                // 未送信の Outbox (IndexedDB) もログアウト時に必ず破棄する。
                // 残しておくと A → ログアウト → B が同一ブラウザに入り直したとき
                // A の queued ジョブが B のセッション cookie で flush され、
                // 別テナントに書き込みが入る (クロステナント情報リーク) 危険がある。
                try {
                  const { clearOutbox } = await import("@/lib/outbox/queue");
                  await clearOutbox();
                } catch {
                  /* ignore */
                }
              } catch {
                /* ignore */
              }
              window.location.replace("/login");
            }}
            className="inline-flex flex-shrink-0 rounded-[var(--radius-sm)] p-1 text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
              />
            </svg>
          </button>
        </div>
      </div>
    </SidebarShell>
  );
}
