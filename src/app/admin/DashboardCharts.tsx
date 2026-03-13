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
  active: "#30d158",
  void: "#ff453a",
  expired: "#ff9f0a",
  draft: "#6e6e73",
  unknown: "#3a3a3c",
};

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="glass-card p-6">
      <div className="text-[11px] font-medium tracking-[0.12em] text-[#86868b] uppercase">Issue Trend</div>
      <div className="text-[15px] font-semibold text-[#1d1d1f] mt-1 mb-5">直近30日の発行数</div>

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
                    fill="#6e6e73"
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
              <stop offset="0%" stopColor="#0071e3" />
              <stop offset="100%" stopColor="#0071e3" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-[#86868b]">{data[0]?.date.slice(5)}</span>
        <span className="text-[10px] text-[#86868b]">{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
        <span className="text-[10px] text-[#86868b]">{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <div className="glass-card p-6">
        <div className="text-[11px] font-medium tracking-[0.12em] text-[#86868b] uppercase">Status</div>
        <div className="text-[15px] font-semibold text-[#1d1d1f] mt-1 mb-5">ステータス別内訳</div>
        <div className="flex items-center justify-center h-40 text-[#86868b] text-sm">データなし</div>
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
        color: STATUS_COLORS[d.status] ?? "#3a3a3c",
      };
    });

  return (
    <div className="glass-card p-6">
      <div className="text-[11px] font-medium tracking-[0.12em] text-[#86868b] uppercase">Status</div>
      <div className="text-[15px] font-semibold text-[#1d1d1f] mt-1 mb-5">ステータス別内訳</div>

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

            <text x={cx} y={cy - 4} textAnchor="middle" fill="#1d1d1f" fontSize="24" fontWeight="600" letterSpacing="-0.02em">
              {total}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="#86868b" fontSize="10" fontWeight="500">
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
                <span className="text-[13px] text-[#6e6e73]">
                  {STATUS_LABELS[seg.status] ?? seg.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[#1d1d1f]">{seg.count}</span>
                <span className="text-[11px] text-[#86868b]">{Math.round(seg.ratio * 100)}%</span>
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
