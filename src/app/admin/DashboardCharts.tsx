"use client";

type Props = {
  recentActivity: { date: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  active: "有効な施工証明書",
  void: "無効の施工証明書",
  expired: "期限切れ",
  draft: "下書き",
  unknown: "不明",
};

const STATUS_COLORS: Record<string, string> = {
  active: "var(--accent-emerald)",
  void: "var(--accent-red)",
  expired: "var(--accent-amber)",
  draft: "var(--text-secondary)",
  unknown: "var(--text-secondary)",
};

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="glass-card p-6">
      <div className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Issue Trend</div>
      <div className="text-[15px] font-semibold text-primary mt-1 mb-5">直近30日の発行数</div>

      <div className="relative" style={{ height: 160 }}>
        <svg width="100%" height="100%" viewBox="0 0 300 160" preserveAspectRatio="none">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={160 - ratio * 140}
              x2="300"
              y2={160 - ratio * 140}
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.5"
            />
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const barH = (d.count / maxCount) * 140;
            const x = (i / data.length) * 300;
            const w = (1 / data.length) * 300 * 0.7;
            return (
              <g key={d.date}>
                <rect
                  x={x + w * 0.2}
                  y={160 - barH}
                  width={w}
                  height={barH}
                  rx={3}
                  fill="url(#barGradient)"
                  opacity={d.count > 0 ? 1 : 0.08}
                />
                {d.count > 0 && (
                  <text
                    x={x + w * 0.2 + w / 2}
                    y={160 - barH - 5}
                    textAnchor="middle"
                    fill="var(--text-secondary)"
                    fontSize="8"
                    fontWeight="500"
                  >
                    {d.count}
                  </text>
                )}
              </g>
            );
          })}

          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-blue)" />
              <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-muted">{data[0]?.date.slice(5)}</span>
        <span className="text-[10px] text-muted">{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
        <span className="text-[10px] text-muted">{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <div className="glass-card p-6">
        <div className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Status</div>
        <div className="text-[15px] font-semibold text-primary mt-1 mb-5">ステータス別内訳</div>
        <div className="flex items-center justify-center h-40 text-muted text-sm">データなし</div>
      </div>
    );
  }

  const radius = 58;
  const cx = 75;
  const cy = 75;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const segments = data
    .filter((d) => d.count > 0)
    .map((d) => {
      const ratio = d.count / total;
      const dashLength = ratio * circumference;
      const offset = cumulativeOffset;
      cumulativeOffset += dashLength;
      return {
        ...d,
        ratio,
        dashLength,
        dashOffset: circumference - offset,
        color: STATUS_COLORS[d.status] ?? "var(--text-secondary)",
      };
    });

  return (
    <div className="glass-card p-6">
      <div className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Status</div>
      <div className="text-[15px] font-semibold text-primary mt-1 mb-5">ステータス別内訳</div>

      <div className="flex items-center gap-8">
        <div className="relative flex-shrink-0">
          <svg width="150" height="150" viewBox="0 0 150 150">
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={strokeWidth} />

            {segments.map((seg) => (
              <circle
                key={seg.status}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
              />
            ))}

            <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-primary)" fontSize="24" fontWeight="600" letterSpacing="-0.02em">
              {total}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontWeight="500">
              Total
            </text>
          </svg>
        </div>

        <div className="flex-1 space-y-2.5">
          {segments.map((seg) => (
            <div key={seg.status} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[13px] text-secondary">
                  {STATUS_LABELS[seg.status] ?? seg.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-primary">{seg.count}</span>
                <span className="text-[11px] text-muted">{Math.round(seg.ratio * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardCharts({ recentActivity, statusBreakdown }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BarChart data={recentActivity} />
      <DonutChart data={statusBreakdown} />
    </div>
  );
}
