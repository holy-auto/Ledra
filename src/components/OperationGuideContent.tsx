import { OPERATION_GUIDE_GROUPS } from "@/lib/operationGuides";

interface OperationGuideContentProps {
  /** href リンクを表示するか (admin 内では true、公開ページでは false) */
  showInternalLinks?: boolean;
  /** 印刷時に1ページに収まりやすい配色にするか */
  printFriendly?: boolean;
}

/**
 * 操作ガイドの全ステップを縦長の読み物形式でレンダリングするサーバーコンポーネント。
 *
 * - HelpDrawer (admin の浮遊ボタン経由) はアコーディオン式
 * - こちらは「全ガイドが一望できる説明資料」スタイル
 *
 * /guide (公開) と /agent/operation-guide (代理店ポータル) の両方で使用される。
 */
export default function OperationGuideContent({
  showInternalLinks = false,
  printFriendly = false,
}: OperationGuideContentProps) {
  const sectionCls = printFriendly ? "space-y-6" : "space-y-6";

  return (
    <div className="space-y-12">
      {OPERATION_GUIDE_GROUPS.map((group, groupIdx) => (
        <section key={group.id} className={sectionCls}>
          <header className="border-b border-border-default pb-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">SECTION {groupIdx + 1}</div>
            <h2 className="mt-1 text-2xl font-bold text-primary">{group.label}</h2>
            {group.intro && <p className="mt-2 text-sm text-muted leading-relaxed">{group.intro}</p>}
          </header>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {group.guides.map((guide, guideIdx) => (
              <article
                key={guide.id}
                className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm"
                id={`guide-${guide.id}`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold tracking-[0.16em] text-muted">
                      {String(groupIdx + 1).padStart(2, "0")}-{String(guideIdx + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-0.5 text-lg font-bold text-primary leading-tight">{guide.title}</h3>
                  </div>
                </div>

                <ol className="space-y-3 sm:pl-16">
                  {guide.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-primary">{step.title}</div>
                        <p className="mt-1 text-sm text-secondary leading-relaxed">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {showInternalLinks && guide.href && (
                  <div className="mt-4 sm:pl-16">
                    <a
                      href={guide.href}
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      この画面を開く →
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
