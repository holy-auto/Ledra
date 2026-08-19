"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * SegmentedControl(ピル型の排他切替)
 * ------------------------------------------------------------
 * 一覧のステータスフィルタ / スコープ切替用。下線タブ(Tabs.tsx)とは役割が別:
 * - Tabs = ページ内セクション切替(詳細ページ)
 * - SegmentedControl = 同一リストの絞り込み・表示モード切替
 *
 * StorefrontReservations / ViewModeToggle / TodayTasksScopeToggle 等に散在する
 * ピル型切替の共通化先(各所は細部の意匠が異なるため、置換は見た目の確認込みで別タスク)。
 * ARIA パターンと roving tabindex は Tabs.tsx と同一。
 */
export interface SegmentItem<K extends string = string> {
  key: K;
  label: ReactNode;
  /** 件数バッジ(font-mono)。 */
  count?: number;
  /** 18x18 規約のインライン SVG(任意)。 */
  icon?: ReactNode;
}

/** 既定 lg = 最小タッチターゲット 44px(v2.0 §3.4)。sm/md は高密度なデスクトップ管理画面専用。 */
type SegmentedControlSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<SegmentedControlSize, string> = {
  sm: "min-h-7 px-2.5 text-[12px]",
  md: "min-h-9 px-3 text-small",
  lg: "min-h-11 px-4 text-body",
};

interface SegmentedControlProps<K extends string> {
  items: SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: SegmentedControlSize;
  className?: string;
  /** アクセシビリティ用ラベル(tablist)。 */
  ariaLabel?: string;
}

export default function SegmentedControl<K extends string>({
  items,
  value,
  onChange,
  size = "lg",
  className = "",
  ariaLabel,
}: SegmentedControlProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((t) => t.key === value);
    if (current < 0) return;
    let next = current;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (current + 1) % items.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(items[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border-subtle bg-inset p-0.5 ${className}`}
    >
      {items.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors ${SIZE_CLASS[size]} ${
              active ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            {t.icon && <span aria-hidden="true">{t.icon}</span>}
            {t.label}
            {t.count != null && (
              <span
                className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold leading-[16px] ${
                  active ? "bg-white/20 text-white" : "border border-border-strong text-muted"
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
