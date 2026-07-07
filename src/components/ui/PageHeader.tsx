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
  /** アイブロウ相当。現在はグローバルバーのパンくずと重複するため非表示（互換のため受け取る）。 */
  tag?: string;
  title: string;
  /** タイトル右に密着させる補助情報（StatusBadge・件数・所属・納期など）。任意。 */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /**
   * L字シェルのページバー。見出しと同じ罫線バー上に、プロト風の下線タブを
   * 横並びで出す。省略時はタブ無し。
   */
  tabs?: PageHeaderTab[];
  /** 現在アクティブなタブの key。 */
  activeTab?: string;
  /** ボタン型タブの選択ハンドラ（href が無いタブで使用。呼び出し側は client）。 */
  onTabSelect?: (key: string) => void;
}

/**
 * 下線タブ 1 個分。バー高さいっぱいに伸ばし、下線をバー下端の罫線に揃える。
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
    // L3 ページバー: 見出し + タブ + アクションを 1 本の罫線バーに横並び。
    // 全幅ブレイクアウトは各ページの max-w ラッパと相性が悪いため使わず、
    // コンテンツ幅に沿う罫線バーとして一貫させる。
    <div className="mb-6 border-b border-border-default">
      <div className="flex min-h-[3.5rem] flex-wrap items-center gap-x-5 gap-y-1">
        <div className="flex shrink-0 flex-col justify-center gap-0.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[19px] leading-tight font-semibold tracking-tight text-primary">{title}</h1>
            {meta != null && <div className="flex items-center gap-2">{meta}</div>}
          </div>
          {description && <p className="text-[12px] leading-tight text-muted">{description}</p>}
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

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2 py-2">{actions}</div>}
      </div>
    </div>
  );
}
