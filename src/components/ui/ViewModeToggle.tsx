"use client";

import { useViewMode, type ViewMode } from "@/lib/view-mode/ViewModeContext";

/**
 * ViewModeToggle
 * ------------------------------------------------------------
 * 「店頭モード / 管理モード」を切り替えるピル型トグル。
 * サイドバー最上部に常時表示され、クリックで即座にビューが切り替わる。
 *
 * - 管理モード: 従来の一覧・詳細 UI (事務作業向け)
 * - 店頭モード: POS 風の大ボタン + カンバン UI (受付・作業進行向け)
 */

type Option = {
  key: ViewMode;
  label: string;
  hint: string;
  icon: React.ReactNode;
};

const OPTIONS: Option[] = [
  {
    key: "storefront",
    label: "店頭",
    hint: "来店受付・作業進行を1タップで",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3.001 3.001 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"
        />
      </svg>
    ),
  },
  {
    key: "admin",
    label: "管理",
    hint: "詳細編集・一覧・分析",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
        />
      </svg>
    ),
  },
];

export default function ViewModeToggle() {
  const { mode, setMode } = useViewMode();

  return (
    <div
      role="tablist"
      aria-label="画面モード切替"
      className="flex items-center gap-0.5 rounded-full border border-border-subtle bg-surface p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.hint}
            onClick={() => setMode(opt.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              active ? "bg-accent text-white shadow-sm" : "text-secondary hover:bg-surface-hover hover:text-primary"
            }`}
          >
            <span className={active ? "text-white" : "text-muted"}>{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
