export default function MyLoading() {
  // Match real /my page wrapper (`mx-auto max-w-lg p-6`) so the container width
  // / gutters stay stable when streamed content swaps in — prevents CLS.
  return (
    <div className="mx-auto max-w-lg space-y-6 p-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-8 w-48 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
      <div className="glass-card overflow-hidden">
        <div className="border-b border-border-subtle p-5 space-y-1">
          <div className="h-3 w-20 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
          <div className="h-5 w-28 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        </div>
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
              <div className="h-4 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
              <div className="h-4 w-20 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
