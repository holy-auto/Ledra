import type { ReactNode } from "react";

/**
 * Timeline — 縦型タイムライン（汎用・表示専用）。
 *
 * 受付→部品手配→施工中→検収→引渡→証明書発行 のような工程履歴を表す
 * design-system プリミティブ。ドメイン固有の各種 Timeline 実装
 * （UnifiedTimeline / ServiceTimeline / CaseTimeline 等）を新規画面で
 * 統一するための土台。
 */
export type TimelineStatus = "done" | "current" | "upcoming";

export interface TimelineItem {
  label: ReactNode;
  /** 右肩の時刻/日付など。 */
  timestamp?: string;
  description?: ReactNode;
  status?: TimelineStatus;
  /** ドット内に表示する任意アイコン（未指定時は状態色の丸）。 */
  icon?: ReactNode;
}

const DOT: Record<TimelineStatus, string> = {
  done: "bg-success",
  current: "bg-accent",
  upcoming: "bg-surface-active",
};

export default function Timeline({ items, className = "" }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={`relative ${className}`} aria-label="タイムライン">
      {items.map((item, i) => {
        const status = item.status ?? "upcoming";
        const last = i === items.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
            {/* dot + connector */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${DOT[status]} ${
                  status === "upcoming" ? "ring-1 ring-border-strong" : ""
                }`}
                aria-hidden
              >
                {item.icon}
              </span>
              {!last && <span className="mt-1 w-px flex-1 bg-border-default" />}
            </div>
            {/* body */}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <div
                  className={`text-[13px] font-medium ${
                    status === "current" ? "text-primary" : status === "done" ? "text-secondary" : "text-muted"
                  }`}
                >
                  {item.label}
                </div>
                {item.timestamp && <time className="shrink-0 font-mono text-[11px] text-muted">{item.timestamp}</time>}
              </div>
              {item.description && <div className="mt-0.5 text-[12px] text-muted">{item.description}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
