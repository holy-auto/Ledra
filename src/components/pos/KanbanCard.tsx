"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * KanbanCard
 * ------------------------------------------------------------
 * 店頭モードのカンバン列に置く案件カード。
 *
 * - 1 枚 1 案件。タイトル / メタ情報 / プライマリアクション (次へ進む等) の構成
 * - カード全体をクリック or キーボード操作で詳細ページへ。プライマリアクションは
 *   独立したボタンとして onClick で発火 (行遷移と区別する)
 * - 次アクション不要のカードは primaryAction なしで OK
 */

type PrimaryAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type Props = {
  title: string;
  href?: string;
  meta?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  primaryAction?: PrimaryAction;
  className?: string;
};

export default function KanbanCard({ title, href, meta, badge, footer, primaryAction, className = "" }: Props) {
  const content = (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-primary break-words">{title}</div>
          {meta && <div className="mt-1 text-[12px] leading-snug text-secondary">{meta}</div>}
        </div>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      {footer && <div className="text-[11px] text-muted">{footer}</div>}
      {primaryAction && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (primaryAction.disabled || primaryAction.loading) return;
            primaryAction.onClick();
          }}
          disabled={primaryAction.disabled || primaryAction.loading}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {primaryAction.loading ? "処理中..." : primaryAction.label}
          {!primaryAction.loading && (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </button>
      )}
    </div>
  );

  const base = `block rounded-xl border border-border-subtle bg-surface transition-shadow hover:shadow-md ${className}`;

  if (href) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }

  return <div className={base}>{content}</div>;
}
