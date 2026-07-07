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
   */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /**
   * L字シェルのページバー相当。見出しと同じバー上に、プロト風の下線タブを
   * 横並びで出す。省略時はタブ無し（従来どおり）。
   */
  tabs?: PageHeaderTab[];
  /** 現在アクティブなタブの key。 */
  activeTab?: string;
  /** ボタン型タブの選択ハンドラ（href が無いタブで使用。呼び出し側は client）。 */
  onTabSelect?: (key: string) => void;
}

/**
 * 下線タブ 1 個分の見た目。バー高さいっぱいに伸ばし、下線をバー下端の罫線に
 * 揃える（L3 ページバー）。
 */
function tabClassName(isActive: boolean): string {
  return [
    "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors",
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
  const hasTabs = !!(tabs && tabs.length > 0);

  return (
    <div className="mb-5">
      {/* L3 ページバー: 見出し + タブ + アクションを 1 本の罫線バーに横並び */}
      <div className="flex min-h-[3.25rem] flex-wrap items-center gap-x-5 gap-y-1 border-b border-border-default">
        <div className="flex shrink-0 flex-col justify-center py-1.5">
          <span className="text-[10px] leading-none font-medium tracking-[0.14em] text-muted uppercase">{tag}</span>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[19px] leading-tight font-semibold tracking-tight text-primary">{title}</h1>
            {meta != null && <div className="flex items-center gap-2">{meta}</div>}
          </div>
        </div>

        {hasTabs && (
          <nav role="tablist" className="flex items-stretch gap-1 self-stretch overflow-x-auto">
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

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2 py-1.5">{actions}</div>}
      </div>

      {description && <p className="mt-2 text-[13px] leading-relaxed text-secondary">{description}</p>}
    </div>
  );
}
