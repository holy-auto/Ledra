"use client";

import type { ReactNode } from "react";

/**
 * Tabs
 * ------------------------------------------------------------
 * L-Shell ナビ仕様（WORKSTREAM B）の確定タブクローム。
 *
 * - アクティブ下線は **テキスト幅に整合**（`inset-x-3` = padding と同じ 12px で
 *   左右をフラッシュ。旧実装の「下線が padding 全幅に伸びて左右に隙間」を解消）。
 * - 件数バッジは **アクティブ=黒塗り / 非アクティブ=アウトライン**。アクティブ
 *   タブだけがバッジごと浮き上がる。
 * - 色はすべてトークン経由（hex 直書きなし）。数値は `font-mono`。
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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 overflow-x-auto border-b border-border-subtle ${className}`}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
              active ? "font-medium text-primary" : "font-normal text-secondary hover:text-primary"
            }`}
          >
            <span>{t.label}</span>
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
            {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
