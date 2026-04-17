/**
 * 飛び込み案件開始フォームのローディングスケルトン
 */
export default function WalkinJobLoading() {
  return (
    <main className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2 pb-2">
        <div className="h-3 w-12 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-8 w-64 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-4 w-96 max-w-full rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
      </div>

      {/* Info banner */}
      <div className="rounded-[var(--radius-lg)] bg-border-subtle dark:bg-[rgba(255,255,255,0.04)] p-4 space-y-2">
        <div className="h-3 w-full max-w-lg rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
        <div className="h-3 w-full max-w-md rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
      </div>

      {/* Form cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card p-5 space-y-4">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
            <div className="h-10 w-full rounded-xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          </div>
          {i === 1 && (
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
              <div className="flex gap-2">
                <div className="h-14 flex-1 rounded-xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
                <div className="h-14 flex-1 rounded-xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-3">
        <div className="h-10 w-24 rounded-xl bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-11 w-40 rounded-xl bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
    </main>
  );
}
