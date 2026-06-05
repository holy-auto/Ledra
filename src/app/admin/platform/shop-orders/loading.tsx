export default function PlatformShopOrdersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-8 w-56 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
      <div className="rounded-xl border border-primary/10 bg-surface p-4 space-y-2">
        <div className="h-3 w-32 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-7 w-16 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-primary/10 bg-surface p-4 flex gap-4">
            <div className="h-4 flex-1 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-24 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-20 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
