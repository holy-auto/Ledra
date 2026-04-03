"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Context = "shop" | "agent";

type UserContexts = {
  has_shop: boolean;
  has_agent: boolean;
  active_context: Context | null;
  tenant_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_status: string | null;
};

/**
 * ContextSwitcher
 *
 * 施工店・代理店の両方の権限を持つユーザー向けのモード切替ドロップダウン。
 * どちらか一方しか持たない場合は何も表示しない。
 */
export default function ContextSwitcher() {
  const router = useRouter();
  const [ctx, setCtx] = useState<UserContexts | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // フェッチ
  useEffect(() => {
    fetch("/api/auth/context")
      .then((r) => r.json())
      .then((d) => {
        if (d.has_shop !== undefined) setCtx(d);
      })
      .catch(() => {});
  }, []);

  // 外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 両方の権限がない場合は非表示
  if (!ctx || !(ctx.has_shop && ctx.has_agent)) return null;

  const activeContext = ctx.active_context;

  const handleSwitch = async (target: Context) => {
    if (switching || target === activeContext) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: target }),
      });
      const data = await res.json();
      if (res.ok && data.redirect_to) {
        setOpen(false);
        router.push(data.redirect_to);
        router.refresh();
      }
    } catch {
      // エラー時はサイレントに処理
    } finally {
      setSwitching(false);
    }
  };

  const currentLabel = activeContext === "agent" ? "代理店モード" : "施工店モード";
  const currentIcon = activeContext === "agent" ? "🤝" : "🔧";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-default bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-secondary transition-all hover:border-accent hover:text-accent"
        title="モードを切り替える"
      >
        <span>{currentIcon}</span>
        <span className="hidden sm:inline">{currentLabel}</span>
        <svg
          width="12"
          height="12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-[var(--radius-lg)] border border-border-default bg-[var(--bg-elevated)] py-1 shadow-lg backdrop-blur-[20px]">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">モード切替</p>

          {/* 施工店モード */}
          <button
            type="button"
            onClick={() => handleSwitch("shop")}
            disabled={switching}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-surface-hover ${
              activeContext === "shop" ? "font-semibold text-accent" : "text-secondary"
            }`}
          >
            <span className="text-base">🔧</span>
            <span className="flex-1 text-left">施工店ダッシュボード</span>
            {activeContext === "shop" && (
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                className="text-accent"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </button>

          {/* 代理店モード */}
          <button
            type="button"
            onClick={() => handleSwitch("agent")}
            disabled={switching}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-surface-hover ${
              activeContext === "agent" ? "font-semibold text-accent" : "text-secondary"
            }`}
          >
            <span className="text-base">🤝</span>
            <span className="flex-1 text-left">代理店ポータル</span>
            {activeContext === "agent" && (
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                className="text-accent"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
