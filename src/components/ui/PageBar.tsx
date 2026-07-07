"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { PageHeaderTab } from "@/components/ui/PageHeader";

/**
 * L3 ページバーをレイアウト階層で全幅のサーフェス帯として描画するための仕組み。
 * 各ページの <PageHeader> は「見た目を持たず」内容をこのコンテキストへ publish し、
 * 実際のバー描画はレイアウト直下の <AdminPageBar> が担う。これにより、
 * ページ側の max-w ラッパに関係なく、グローバルバー直下に密着した全幅の
 * 白帯（プロトの L3 ページバー）を実現する。
 */
export interface PageBarContent {
  title: string;
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  tabs?: PageHeaderTab[];
  activeTab?: string;
  onTabSelect?: (key: string) => void;
}

// publish 関数は安定参照（これを購読する <PageHeader> は bar 変化で再レンダーしない）。
const PublishContext = createContext<(content: PageBarContent | null) => void>(() => {});
// bar スナップショット（これを購読する <AdminPageBar> のみ変化で再レンダー）。
const ValueContext = createContext<PageBarContent | null>(null);

export function PageBarProvider({ children }: { children: ReactNode }) {
  const [bar, setBar] = useState<PageBarContent | null>(null);
  const publish = useCallback((content: PageBarContent | null) => setBar(content), []);
  return (
    <PublishContext.Provider value={publish}>
      <ValueContext.Provider value={bar}>{children}</ValueContext.Provider>
    </PublishContext.Provider>
  );
}

/** <PageHeader> から内容を publish する（描画は行わない）。 */
export function usePublishPageBar(content: PageBarContent) {
  const publish = useContext(PublishContext);
  // title/description/activeTab/tabs/有無 が変わった時だけ再 publish（無限ループ防止）。
  // meta/actions は publish 時のスナップショットで取り込む。
  const sig = JSON.stringify([
    content.title,
    content.description ?? null,
    content.activeTab ?? null,
    content.tabs?.map((t) => [t.key, t.label, t.badge ?? null, t.href ?? null]) ?? null,
    !!content.actions,
    !!content.meta,
  ]);
  const snapshotRef = useRef(content);
  snapshotRef.current = content;
  useEffect(() => {
    publish(snapshotRef.current);
    return () => publish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, publish]);
}

function TabBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={`rounded-full px-1.5 font-mono text-[10px] font-semibold ${
        active ? "bg-accent text-inverse" : "text-muted shadow-[inset_0_0_0_1px_var(--border-strong)]"
      }`}
    >
      {count}
    </span>
  );
}

function tabClassName(isActive: boolean): string {
  return [
    "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors",
    isActive
      ? "border-accent font-medium text-primary"
      : "border-transparent font-normal text-secondary hover:text-primary",
  ].join(" ");
}

/**
 * レイアウト直下に置く全幅サーフェス帯。publish された内容がある時のみ描画する
 * （PageHeader を使わないページでは何も出さない）。
 */
export default function AdminPageBar() {
  const bar = useContext(ValueContext);
  if (!bar) return null;
  const { title, meta, actions, tabs, activeTab, onTabSelect } = bar;
  const hasTabs = !!(tabs && tabs.length > 0);

  return (
    <div className="sticky top-11 z-10 border-b border-border-default bg-surface px-4 sm:px-6">
      <div className="flex min-h-[3.25rem] flex-wrap items-center gap-x-5 gap-y-1">
        <div className="flex shrink-0 items-center gap-2.5 py-2">
          <h1 className="text-[19px] leading-tight font-semibold tracking-tight text-primary">{title}</h1>
          {meta != null && <div className="flex items-center gap-2">{meta}</div>}
        </div>

        {hasTabs && (
          <nav
            role="tablist"
            className="flex items-stretch gap-1 self-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs!.map((tab) => {
              const isActive = tab.key === activeTab;
              const inner = (
                <>
                  {tab.label}
                  {tab.badge != null && <TabBadge count={tab.badge} active={isActive} />}
                </>
              );
              return tab.href ? (
                <Link
                  key={tab.key}
                  href={tab.href}
                  role="tab"
                  aria-selected={isActive}
                  className={tabClassName(isActive)}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onTabSelect?.(tab.key)}
                  className={tabClassName(isActive)}
                >
                  {inner}
                </button>
              );
            })}
          </nav>
        )}

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2 py-2">{actions}</div>}
      </div>
    </div>
  );
}
