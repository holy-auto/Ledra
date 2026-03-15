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

const STATUS_DOT: Record<string, string> = {
  confirmed: "bg-[#0071e3]",
  arrived: "bg-[#f09300]",
  in_progress: "bg-[#5856d6]",
  completed: "bg-[#28a745]",
  cancelled: "bg-[#aeaeb2]",
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
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

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
      isCurrentMonth: true,
    });
  }

  // Next month padding
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
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="btn-secondary px-2 py-1 text-xs" aria-label="前月">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <h3 className="text-sm font-semibold text-primary min-w-[120px] text-center">
            {viewYear}年{viewMonth + 1}月
          </h3>
          <button onClick={goNext} className="btn-secondary px-2 py-1 text-xs" aria-label="翌月">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
        <button onClick={goToday} className="btn-secondary px-3 py-1 text-xs">今日</button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className={`py-2 text-center text-[11px] font-semibold tracking-wider ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted"
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
          const dayOfWeek = new Date(cell.date).getDay();

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onDateClick(cell.date)}
              className={`relative min-h-[72px] border-b border-r border-border-subtle p-1.5 text-left transition-colors hover:bg-surface-hover ${
                !cell.isCurrentMonth ? "bg-[rgba(0,0,0,0.02)]" : ""
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isToday
                    ? "bg-[#0071e3] text-white"
                    : !cell.isCurrentMonth
                    ? "text-muted/40"
                    : dayOfWeek === 0
                    ? "text-red-400"
                    : dayOfWeek === 6
                    ? "text-blue-400"
                    : "text-primary"
                }`}
              >
                {cell.day}
              </span>

              {/* Reservation dots */}
              {activeRes.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {activeRes.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate"
                      title={`${r.start_time ? r.start_time.slice(0, 5) + " " : ""}${r.title}`}
                    >
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[r.status] ?? "bg-zinc-400"}`} />
                      <span className="truncate text-secondary">
                        {r.start_time ? r.start_time.slice(0, 5) + " " : ""}
                        {r.title}
                      </span>
                    </div>
                  ))}
                  {activeRes.length > 3 && (
                    <div className="px-1 text-[10px] text-muted">+{activeRes.length - 3}件</div>
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
