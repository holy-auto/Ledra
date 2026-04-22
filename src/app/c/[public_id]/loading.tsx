/**
 * Public certificate loading state.
 *
 * Wrapper mirrors the real page's `<main className="mx-auto max-w-[980px] p-4">`
 * so the container width / gutters stay stable when the streamed content swaps
 * in — prevents the horizontal/content CLS that inflates mobile share-link RES.
 */
export default function CPublicIdLoading() {
  return (
    <div className="mx-auto max-w-[980px] space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-8 w-48 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="glass-card p-5 space-y-4">
            <div className="h-5 w-32 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex justify-between">
                <div className="h-4 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
                <div className="h-4 w-32 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
