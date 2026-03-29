export default function CustomerTenantLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-8 w-48 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-4 w-64 rounded bg-[rgba(0,0,0,0.04)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="glass-card p-5 space-y-2">
            <div className="h-3 w-16 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-7 w-20 rounded bg-[rgba(0,0,0,0.06)]" />
          </div>
        ))}
      </div>
      <div className="glass-card p-5 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 flex-1 rounded bg-[rgba(0,0,0,0.04)]" />
            <div className="h-4 w-24 rounded bg-[rgba(0,0,0,0.04)]" />
            <div className="h-4 w-20 rounded bg-[rgba(0,0,0,0.04)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
