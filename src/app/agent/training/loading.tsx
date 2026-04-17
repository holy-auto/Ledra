export default function TrainingLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-8 w-48 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-5 space-y-3">
            <div className="h-32 w-full rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-3/4 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
            <div className="h-3 w-1/2 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
