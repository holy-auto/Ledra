export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-8 w-48 rounded bg-[rgba(0,0,0,0.06)]" />
      </div>
      <div className="glass-card p-5 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-10 w-full rounded bg-[rgba(0,0,0,0.04)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
