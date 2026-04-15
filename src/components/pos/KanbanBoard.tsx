"use client";

import type { ReactNode } from "react";

/**
 * KanbanBoard / KanbanColumn
 * ------------------------------------------------------------
 * 店頭モードで「進行中の案件」を 3〜4 列のカンバンで俯瞰するための土台。
 *  - 列ヘッダに色ドット + ラベル + 件数
 *  - モバイルでは横スクロール、PC では等分グリッド
 *  - カード自体は呼び出し側で自由に組み立てる (children)
 */

export type KanbanTone = "neutral" | "primary" | "warning" | "success" | "danger";

function dotClasses(tone: KanbanTone): string {
  switch (tone) {
    case "primary":
      return "bg-accent";
    case "warning":
      return "bg-warning";
    case "success":
      return "bg-success";
    case "danger":
      return "bg-danger";
    case "neutral":
    default:
      return "bg-muted";
  }
}

export function KanbanBoard({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

type ColumnProps = {
  label: string;
  count: number;
  tone?: KanbanTone;
  hint?: string;
  emptyMessage?: string;
  action?: ReactNode;
  children?: ReactNode;
};

export function KanbanColumn({
  label,
  count,
  tone = "neutral",
  hint,
  emptyMessage = "この列には案件がありません",
  action,
  children,
}: ColumnProps) {
  const hasChildren = count > 0;

  return (
    <section className="flex min-h-[240px] flex-col rounded-2xl border border-border-subtle bg-inset/60 p-3">
      <header className="mb-2 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClasses(tone)}`} />
        <h3 className="text-sm font-bold text-primary">{label}</h3>
        <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-semibold text-secondary">
          {count}
        </span>
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {hint && <p className="mb-2 text-[11px] text-muted">{hint}</p>}
      <div className="flex flex-1 flex-col gap-2">
        {hasChildren ? (
          children
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface/40 px-3 py-6 text-center text-[12px] text-muted">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  );
}
