"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Tabs
 * ------------------------------------------------------------
 * L-Shell ナビ仕様（WORKSTREAM B）の確定タブクローム。
 *
 * - アクティブ下線は **ラベル文字幅に整合**（badge を含めず label span に
 *   アンカー。旧実装の「下線が padding/badge 全幅に伸びる」を解消＝Fix 2）。
 * - 件数バッジは **アクティブ=黒塗り / 非アクティブ=アウトライン**（Fix 4）。
 * - 色はすべてトークン経由（hex 直書きなし）。数値は `font-mono`。
 * - ARIA tab パターン: `role="tablist"`/`role="tab"` + roving tabindex +
 *   ←/→/Home/End キーでの移動に対応。
 *
 * タブの意味論（混在させない）:
 * - 一覧ページ = ステータスフィルタ（順序 = 処理フロー順 / バッジ = 件数）
 * - 詳細ページ = セクション切替（順序 = 重要度 / バッジ = 子要素数）
 */
export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  /** 件数バッジ。アクティブ=黒塗り / 非アクティブ=アウトラインで自動描画。 */
  count?: number;
  /** count の代わりに任意のバッジ要素を出すエスケープハッチ（例: 赤アラート）。 */
  badge?: ReactNode;
}

interface TabsProps<K extends string> {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** タブ列に付与する追加クラス。 */
  className?: string;
  /** アクセシビリティ用ラベル（tablist）。 */
  ariaLabel?: string;
}

export default function Tabs<K extends string>({ tabs, value, onChange, className = "", ariaLabel }: TabsProps<K>) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((t) => t.key === value);
    if (current < 0) return;
    let next = current;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (current + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(tabs[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex items-center gap-1 overflow-x-auto border-b border-border-subtle ${className}`}
    >
      {tabs.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={`relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
              active ? "font-medium text-primary" : "font-normal text-secondary hover:text-primary"
            }`}
          >
            {/* 下線はラベル文字幅にのみアンカー（badge は含めない）。 */}
            <span className="relative">
              {t.label}
              {active && <span className="absolute inset-x-0 -bottom-[11px] h-0.5 rounded-full bg-primary" />}
            </span>
            {t.badge != null
              ? t.badge
              : t.count != null && (
                  <span
                    className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-[16px] ${
                      active ? "bg-primary text-inverse" : "border border-border-strong text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
          </button>
        );
      })}
    </div>
  );
}
