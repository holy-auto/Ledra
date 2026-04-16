/**
 * 案件ワークフロー画面のローディングスケルトン
 * 実画面のレイアウトに合わせて「ステッパー → クイックアクション → タブ → カード」の
 * 骨組みを先に描画することで、体感速度を向上させる。
 */
export default function JobWorkflowLoading() {
  return (
    <main className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="space-y-2">
          <div className="h-3 w-12 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="h-8 w-64 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="h-4 w-96 max-w-full rounded bg-[rgba(0,0,0,0.04)]" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-[rgba(0,0,0,0.06)]" />
      </div>

      {/* Status Stepper Card */}
      <div className="glass-card p-5 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-20 rounded-full bg-[rgba(0,0,0,0.06)]" />
              <div className="h-4 w-48 rounded bg-[rgba(0,0,0,0.04)]" />
            </div>
          </div>
          <div className="h-9 w-36 rounded-xl bg-[rgba(0,0,0,0.06)]" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-7 w-28 rounded-full bg-[rgba(0,0,0,0.06)]" />
              {i < 4 && <div className="h-3 w-3 rounded bg-[rgba(0,0,0,0.04)]" />}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions Card */}
      <div className="glass-card p-5 space-y-3">
        <div className="h-3 w-24 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-32 rounded-xl bg-[rgba(0,0,0,0.06)]" />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border-subtle">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 rounded bg-[rgba(0,0,0,0.04)]" />
        ))}
      </div>

      {/* Tab content: two cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="glass-card p-5 space-y-3">
            <div className="h-3 w-24 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="space-y-2 mt-3">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-4 w-20 rounded bg-[rgba(0,0,0,0.04)]" />
                  <div className="h-4 w-32 rounded bg-[rgba(0,0,0,0.04)]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
