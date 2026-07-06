import type { ReactNode } from "react";
import Link from "next/link";

export interface PageHeaderTab {
  /** 一意キー。activeTab と照合する。 */
  key: string;
  label: string;
  /** 件数などのバッジ（任意）。 */
  badge?: number;
  /** ルート型タブはこれを渡すと <Link> になる。省略時は onTabSelect のボタン。 */
  href?: string;
}

interface PageHeaderProps {
  tag: string;
  title: string;
  /**
   * タイトル右に密着させる補助情報（StatusBadge・件数・所属・納期など）。任意。
   * title + meta は `inline-flex { gap: 10px }` のクラスタにまとめる（負マージン禁止）。
   */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /**
   * L字シェルのページバー相当。見出し直下にプロト風の下線タブ帯を出す。
   * 省略時は従来どおりタブ無し（既存ページに一切影響しない）。
   */
  tabs?: PageHeaderTab[];
  /** 現在アクティブなタブの key。 */
  activeTab?: string;
  /** ボタン型タブの選択ハンドラ（href が無いタブで使用。呼び出し側は client）。 */
  onTabSelect?: (key: string) => void;
}

/** 下線タブ 1 個分の見た目（active/badge を共有）。 */
function tabClassName(isActive: boolean): string {
  return [
    "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors",
    isActive
      ? "border-accent font-medium text-primary"
      : "border-transparent font-normal text-secondary hover:text-primary",
  ].join(" ");
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

export default function PageHeader({
  tag,
  title,
  meta,
  description,
  actions,
  tabs,
  activeTab,
  onTabSelect,
}: PageHeaderProps) {
  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[11px] font-medium tracking-[0.12em] text-secondary uppercase">{tag}</span>
          <div className="inline-flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-primary">{title}</h1>
            {meta != null && <div className="inline-flex items-center gap-2">{meta}</div>}
          </div>
          {description && <p className="text-[14px] leading-relaxed text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border-default">
          {tabs.map((tab) => {
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
        </div>
      )}
    </div>
  );
}
