export default function AgentLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-8 w-48 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-4 w-64 rounded bg-[rgba(0,0,0,0.04)]" />
      </div>

      {/* Stats skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-5 space-y-2">
            <div className="h-3 w-16 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-7 w-20 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-3 w-12 rounded bg-[rgba(0,0,0,0.04)]" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="glass-card overflow-hidden">
        <div className="border-b border-border-subtle p-5 space-y-1">
          <div className="h-3 w-20 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="h-5 w-28 rounded bg-[rgba(0,0,0,0.06)]" />
        </div>
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 rounded bg-[rgba(0,0,0,0.04)]" />
              <div className="h-4 w-24 rounded bg-[rgba(0,0,0,0.04)]" />
              <div className="h-4 w-20 rounded bg-[rgba(0,0,0,0.04)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
