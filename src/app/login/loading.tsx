export default function LoginLoading() {
  // Mirror the real /login page's `min-h-screen flex items-center justify-center`
  // wrapper so the centered card doesn't jump vertically when the real form
  // swaps in — keeps CLS low on mobile.
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 animate-pulse">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-8 w-48 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
          <div className="mx-auto h-4 w-64 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
        </div>
        <div className="glass-card p-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
              <div className="h-10 w-full rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
            </div>
          ))}
          <div className="h-10 w-full rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.08)]" />
        </div>
      </div>
    </div>
  );
}
