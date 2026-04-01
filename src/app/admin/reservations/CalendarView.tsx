"use client";

import { useMemo, useState } from "react";

type Reservation = {
  id: string;
  scheduled_date: string;
  status: string;
  title: string;
  customer_name: string | null;
  start_time: string | null;
};

interface CalendarViewProps {
  reservations: Reservation[];
  onDateClick: (date: string) => void;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const STATUS_COLOR: Record<string, { bar: string; text: string; bg: string }> = {
  confirmed: { bar: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50" },
  arrived: { bar: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
  in_progress: { bar: "bg-violet-500", text: "text-violet-700", bg: "bg-violet-50" },
  completed: { bar: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  cancelled: { bar: "bg-gray-300", text: "text-gray-400", bg: "bg-gray-50" },
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    cells.push({
      date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
      isCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
      isCurrentMonth: true,
    });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      cells.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        isCurrentMonth: false,
      });
    }
  }
  return cells;
}

export default function CalendarView({ reservations, onDateClick }: CalendarViewProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const cells = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const byDate = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    for (const r of reservations) {
      if (!map[r.scheduled_date]) map[r.scheduled_date] = [];
      map[r.scheduled_date].push(r);
    }
    return map;
  }, [reservations]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // Monthly stats
  const monthStats = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    const monthRes = reservations.filter((r) => r.scheduled_date.startsWith(prefix));
    const active = monthRes.filter((r) => r.status !== "cancelled");
    const completed = monthRes.filter((r) => r.status === "completed");
    return { total: active.length, completed: completed.length };
  }, [reservations, viewYear, viewMonth]);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            className="btn-secondary w-8 h-8 flex items-center justify-center rounded-xl"
            aria-label="前月"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="text-center">
            <h3 className="text-base font-bold text-primary">
              {viewYear}年{viewMonth + 1}月
            </h3>
            <div className="text-xs text-muted mt-0.5">
              {monthStats.total}件 / 完了{monthStats.completed}件
            </div>
          </div>
          <button
            onClick={goNext}
            className="btn-secondary w-8 h-8 flex items-center justify-center rounded-xl"
            aria-label="翌月"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted">
            {Object.entries(STATUS_COLOR)
              .filter(([k]) => k !== "cancelled")
              .map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${cfg.bar}`} />
                  {{ confirmed: "確定", arrived: "来店", in_progress: "作業中", completed: "完了" }[key]}
                </div>
              ))}
          </div>
          <button onClick={goToday} className="btn-secondary px-3 py-1.5 text-xs rounded-xl">
            今日
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-hover">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className={`py-2.5 text-center text-[11px] font-bold tracking-wider ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-500" : "text-muted"
            }`}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayRes = byDate[cell.date] ?? [];
          const activeRes = dayRes.filter((r) => r.status !== "cancelled");
          const isToday = cell.date === todayStr;
          const dayOfWeek = new Date(cell.date + "T12:00:00").getDay();
          const isSat = dayOfWeek === 6;
          const isSun = dayOfWeek === 0;

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onDateClick(cell.date)}
              className={`relative min-h-[88px] border-b border-r border-border-subtle p-2 text-left transition-colors hover:bg-surface-hover group ${
                !cell.isCurrentMonth ? "opacity-40" : ""
              } ${isSat ? "bg-blue-50/20" : isSun ? "bg-red-50/20" : ""}`}
            >
              {/* Day number */}
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isToday
                    ? "bg-accent text-inverse"
                    : isSun
                      ? "text-red-400"
                      : isSat
                        ? "text-blue-500"
                        : "text-primary group-hover:bg-surface-hover"
                }`}
              >
                {cell.day}
              </span>

              {/* Total count badge */}
              {activeRes.length > 0 && (
                <span className="absolute top-1.5 right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent text-[9px] font-bold text-inverse px-1">
                  {activeRes.length}
                </span>
              )}

              {/* Reservation items */}
              {activeRes.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {activeRes.slice(0, 2).map((r) => {
                    const cfg = STATUS_COLOR[r.status] ?? STATUS_COLOR.confirmed;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-[9px] leading-tight truncate ${cfg.bg}`}
                        title={`${r.start_time ? r.start_time.slice(0, 5) + " " : ""}${r.title}${r.customer_name ? ` / ${r.customer_name}` : ""}`}
                      >
                        <span className={`inline-block h-1.5 w-1 shrink-0 rounded-full ${cfg.bar}`} />
                        <span className={`truncate ${cfg.text} font-medium`}>
                          {r.start_time ? r.start_time.slice(0, 5) + " " : ""}
                          {r.title}
                        </span>
                      </div>
                    );
                  })}
                  {activeRes.length > 2 && (
                    <div className="px-1 text-[9px] text-muted font-medium">+{activeRes.length - 2}件</div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
