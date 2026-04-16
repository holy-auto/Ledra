/**
 * 取引ハブのローディングスケルトン
 */
export default function TradesLoading() {
  return (
    <main className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2 pb-2">
        <div className="h-3 w-16 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-8 w-56 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-4 w-96 max-w-full rounded bg-[rgba(0,0,0,0.04)]" />
      </div>

      {/* Info card */}
      <div className="rounded-[var(--radius-lg)] bg-[rgba(0,0,0,0.03)] p-4 space-y-2">
        <div className="h-3 w-full max-w-lg rounded bg-[rgba(0,0,0,0.04)]" />
        <div className="h-3 w-2/3 rounded bg-[rgba(0,0,0,0.04)]" />
      </div>

      {/* Hub cards grid */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="glass-card p-5 space-y-2">
            <div className="h-3 w-20 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-5 w-40 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-4 w-full rounded bg-[rgba(0,0,0,0.04)]" />
            <div className="h-4 w-12 rounded bg-[rgba(0,0,0,0.04)] mt-2" />
          </div>
        ))}
      </section>
    </main>
  );
}
