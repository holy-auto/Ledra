/**
 * Marketing root loading state.
 *
 * The real page renders a Hero with min-h-[92vh] plus several sections; reserve
 * roughly the same vertical space to prevent a large CLS when streamed content
 * swaps in for the skeleton.
 */
export default function HomeLoading() {
  return (
    <div className="space-y-16 animate-pulse">
      {/* Hero placeholder — reserves hero height to avoid CLS */}
      <div className="flex min-h-[92vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-12 w-2/3 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        <div className="h-6 w-1/2 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
        <div className="h-10 w-36 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl p-6">
            <div className="h-8 w-8 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
            <div className="h-5 w-32 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
            <div className="h-4 w-full rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
