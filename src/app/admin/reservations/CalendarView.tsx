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

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  confirmed: { bg: "bg-accent-dim", text: "text-accent-text", dot: "bg-accent" },
  arrived: { bg: "bg-warning-dim", text: "text-warning-text", dot: "bg-warning" },
  in_progress: { bg: "bg-violet-dim", text: "text-violet-text", dot: "bg-violet" },
  completed: { bg: "bg-success-dim", text: "text-success-text", dot: "bg-success" },
  cancelled: { bg: "bg-inset", text: "text-secondary", dot: "bg-muted" },
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
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const byDate = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    for (const r of reservations) {
      if (!map[r.scheduled_date]) map[r.scheduled_date] = [];
      map[r.scheduled_date].push(r);
    }
    return map;
  }, [reservations]);

  // サマリー計算: 当月の統計
  const monthStats = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    const monthRes = reservations.filter((r) => r.scheduled_date.startsWith(prefix) && r.status !== "cancelled");
    const daysWithRes = new Set(monthRes.map((r) => r.scheduled_date)).size;
    return { total: monthRes.length, activeDays: daysWithRes };
  }, [reservations, viewYear, viewMonth]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else setViewMonth(viewMonth + 1);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" aria-label="前月">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h3 className="text-base font-bold min-w-[120px] text-center">
              {viewYear}年{viewMonth + 1}月
            </h3>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" aria-label="翌月">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            {/* Month stats */}
            <div className="text-right">
              <div className="text-[10px] text-blue-200">今月の予約</div>
              <div className="text-sm font-bold">
                {monthStats.total}件 / {monthStats.activeDays}日
              </div>
            </div>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors"
            >
              今日
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-t border-white/20">
          {WEEKDAYS.map((wd, i) => (
            <div
              key={wd}
              className={`py-2 text-center text-[11px] font-bold tracking-widest ${
                i === 0 ? "text-red-200" : i === 6 ? "text-blue-200" : "text-white/70"
              }`}
            >
              {wd}
            </div>
          ))}
        </div>
      </div>

      {/* ── Day cells ── */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayRes = byDate[cell.date] ?? [];
          const activeRes = dayRes.filter((r) => r.status !== "cancelled");
          const isToday = cell.date === todayStr;
          const dayOfWeek = new Date(cell.date).getDay();
          const isSat = dayOfWeek === 6;
          const isSun = dayOfWeek === 0;

          // 今日の件数バッジ
          const confirmedCount = activeRes.filter((r) => r.status === "confirmed").length;
          const inProgressCount = activeRes.filter((r) => r.status === "in_progress" || r.status === "arrived").length;
          const completedCount = activeRes.filter((r) => r.status === "completed").length;

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onDateClick(cell.date)}
              className={`relative min-h-[80px] border-b border-r border-border-subtle p-1.5 text-left transition-colors group ${
                !cell.isCurrentMonth ? "bg-surface-hover/50" : ""
              } ${isSat && cell.isCurrentMonth ? "bg-accent-dim/30" : ""}
              ${isSun && cell.isCurrentMonth ? "bg-danger-dim/30" : ""}
              hover:bg-accent-dim/50 active:bg-accent-dim`}
            >
              {/* Date number */}
              <div className="flex items-start justify-between mb-1">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isToday
                      ? "bg-accent text-white shadow-sm"
                      : !cell.isCurrentMonth
                        ? "text-muted/30"
                        : isSun
                          ? "text-red-400"
                          : isSat
                            ? "text-blue-500"
                            : "text-primary"
                  }`}
                >
                  {cell.day}
                </span>

                {/* Total count badge */}
                {activeRes.length > 0 && cell.isCurrentMonth && (
                  <span className="text-[10px] font-bold text-muted bg-surface-hover rounded-full px-1.5 py-0.5 leading-none">
                    {activeRes.length}
                  </span>
                )}
              </div>

              {/* Status mini bars */}
              {activeRes.length > 0 && cell.isCurrentMonth && (
                <div className="flex gap-0.5 mb-1">
                  {confirmedCount > 0 && (
                    <div
                      className="h-1 rounded-full bg-blue-400"
                      style={{ flex: confirmedCount }}
                      title={`確定 ${confirmedCount}件`}
                    />
                  )}
                  {inProgressCount > 0 && (
                    <div
                      className="h-1 rounded-full bg-violet-400"
                      style={{ flex: inProgressCount }}
                      title={`進行中 ${inProgressCount}件`}
                    />
                  )}
                  {completedCount > 0 && (
                    <div
                      className="h-1 rounded-full bg-success"
                      style={{ flex: completedCount }}
                      title={`完了 ${completedCount}件`}
                    />
                  )}
                </div>
              )}

              {/* Reservation list (max 2) */}
              {activeRes.length > 0 && cell.isCurrentMonth && (
                <div className="space-y-0.5">
                  {activeRes.slice(0, 2).map((r) => {
                    const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.confirmed;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] leading-tight truncate ${sc.bg}`}
                        title={`${r.start_time ? r.start_time.slice(0, 5) + " " : ""}${r.title}${r.customer_name ? " / " + r.customer_name : ""}`}
                      >
                        <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${sc.dot}`} />
                        <span className={`truncate font-medium ${sc.text}`}>
                          {r.start_time ? r.start_time.slice(0, 5) + " " : ""}
                          {r.title}
                        </span>
                      </div>
                    );
                  })}
                  {activeRes.length > 2 && (
                    <div className="px-1 text-[10px] text-muted font-medium">+{activeRes.length - 2}件</div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border-subtle bg-surface-hover/30">
        {[
          { dot: "bg-blue-400", label: "予約確定" },
          { dot: "bg-violet-400", label: "来店・作業中" },
          { dot: "bg-success", label: "完了" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`w-2 h-2 rounded-full ${item.dot}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
