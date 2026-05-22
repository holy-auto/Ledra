type Props = {
  label: string;
  value: string;
  hint?: string | null;
  trend?: "up" | "down" | "flat" | null;
};

const TREND_LABEL: Record<NonNullable<Props["trend"]>, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};
const TREND_TONE: Record<NonNullable<Props["trend"]>, string> = {
  up: "text-emerald-700",
  down: "text-rose-700",
  flat: "text-zinc-500",
};

export default function StatTile({ label, value, hint, trend }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {trend ? (
          <span className={`text-sm font-medium ${TREND_TONE[trend]}`} aria-label={`trend ${trend}`}>
            {TREND_LABEL[trend]}
          </span>
        ) : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}
