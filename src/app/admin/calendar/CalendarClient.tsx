"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ─── 型定義 ──────────────────────────────────────────────────────
interface CalendarReservation {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  title: string;
  note: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  estimated_amount: number | null;
  customer_name: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
}

// 1 日のセルに展開して表示する予約の最大数。これを超えたら「他N件」。
const MAX_VISIBLE_PER_DAY = 4;

// ステータスバッジの配色 (Tailwind class)。reservations の status 値に合わせる。
//   confirmed=予定(青) / arrived=来店(藍) / in_progress=作業中(橙) /
//   completed=完了(緑) / その他=灰
const STATUS_META: Record<string, { label: string; badge: string; bar: string }> = {
  confirmed: {
    label: "予定",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    bar: "bg-blue-500/70",
  },
  arrived: {
    label: "来店",
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    bar: "bg-indigo-500/70",
  },
  in_progress: {
    label: "作業中",
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    bar: "bg-orange-500/70",
  },
  completed: {
    label: "完了",
    badge: "bg-green-500/15 text-green-300 border-green-500/30",
    bar: "bg-green-500/70",
  },
};

const FALLBACK_STATUS = {
  label: "その他",
  badge: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  bar: "bg-gray-500/70",
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? FALLBACK_STATUS;
}

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

// ─── 日付ユーティリティ ───────────────────────────────────────────
/** ローカル日付を "YYYY-MM-DD" に変換 (tz ずれを避けるため UTC ではなくローカル) */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 指定日を含む週の月曜日 (00:00) を返す */
function startOfWeekMonday(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = d.getDay(); // 0=日 .. 6=土
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** "HH:MM:SS" → "HH:MM" (null は null) */
function shortTime(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

function vehicleLabel(r: CalendarReservation): string | null {
  const parts = [r.vehicle_maker, r.vehicle_model].filter(Boolean) as string[];
  const base = parts.join(" ");
  if (base && r.vehicle_plate) return `${base} / ${r.vehicle_plate}`;
  if (base) return base;
  return r.vehicle_plate ?? null;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function CalendarClient() {
  // 表示中の週の月曜日。
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [byDate, setByDate] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 「他N件」を展開した日付セット。
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  const todayYmd = useMemo(() => toYmd(new Date()), []);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // 取得範囲は当該週 (月曜) から翌週日曜まで = 14 日。
  const rangeFrom = useMemo(() => toYmd(weekStart), [weekStart]);
  const rangeTo = useMemo(() => toYmd(addDays(weekStart, 13)), [weekStart]);

  const reservationById = useMemo(() => {
    const map: Record<string, CalendarReservation> = {};
    for (const r of reservations) map[r.id] = r;
    return map;
  }, [reservations]);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(`/api/admin/calendar?${qs.toString()}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setReservations(Array.isArray(data.reservations) ? data.reservations : []);
      setByDate(data.by_date && typeof data.by_date === "object" ? data.by_date : {});
    } catch (e) {
      console.error(e);
      setError("予約の読み込みに失敗しました");
      setReservations([]);
      setByDate({});
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // 週移動時は展開状態をリセット。
  const goPrevWeek = useCallback(() => {
    setExpandedDays(new Set());
    setWeekStart((w) => addDays(w, -7));
  }, []);
  const goNextWeek = useCallback(() => {
    setExpandedDays(new Set());
    setWeekStart((w) => addDays(w, 7));
  }, []);
  const goThisWeek = useCallback(() => {
    setExpandedDays(new Set());
    setWeekStart(startOfWeekMonday(new Date()));
  }, []);

  const toggleExpand = useCallback((ymd: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  }, []);

  // 週ラベル (例: 2026年6月9日 〜 15日)
  const weekLabel = useMemo(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);
    const startStr = `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`;
    const sameMonth = start.getMonth() === end.getMonth();
    const endStr = sameMonth ? `${end.getDate()}日` : `${end.getMonth() + 1}月${end.getDate()}日`;
    return `${startStr} 〜 ${endStr}`;
  }, [weekStart]);

  const totalThisWeek = useMemo(() => {
    return weekDays.reduce((sum, d) => sum + (byDate[toYmd(d)]?.length ?? 0), 0);
  }, [weekDays, byDate]);

  return (
    <div className="mx-auto max-w-6xl pb-20">
      {/* ヘッダー */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">入庫カレンダー</h1>
          <p className="mt-1 text-sm text-secondary">今週・翌週の入庫予定を一覧で確認できます</p>
        </div>
        <Link
          href="/admin/reservations"
          className="rounded-lg bg-inset px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
        >
          予約管理へ
        </Link>
      </div>

      {/* 週ナビゲーション */}
      <div className="glass-card mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrevWeek}
            className="rounded-lg bg-inset px-3 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
            aria-label="前週"
          >
            ← 前週
          </button>
          <button
            onClick={goThisWeek}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            今週
          </button>
          <button
            onClick={goNextWeek}
            className="rounded-lg bg-inset px-3 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
            aria-label="次週"
          >
            次週 →
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-primary">{weekLabel}</span>
          <span className="rounded-full border border-border-default px-2.5 py-0.5 text-xs text-muted">
            合計 {totalThisWeek} 件
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* カレンダー本体 (モバイルは横スクロール) */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {weekDays.map((day, idx) => {
            const ymd = toYmd(day);
            const ids = byDate[ymd] ?? [];
            const dayReservations = ids.map((id) => reservationById[id]).filter(Boolean) as CalendarReservation[];
            const isToday = ymd === todayYmd;
            const isWeekend = idx >= 5; // 5=土, 6=日
            const expanded = expandedDays.has(ymd);
            const visible = expanded ? dayReservations : dayReservations.slice(0, MAX_VISIBLE_PER_DAY);
            const hiddenCount = dayReservations.length - visible.length;

            return (
              <div
                key={ymd}
                className={`flex min-h-[200px] min-w-[140px] flex-col rounded-xl border ${
                  isToday ? "border-accent" : "border-border-default"
                } ${isWeekend ? "bg-inset/40" : "bg-surface"}`}
              >
                {/* 日ヘッダー */}
                <div
                  className={`flex items-center justify-between gap-1 rounded-t-xl border-b border-border-subtle px-2.5 py-2 ${
                    isToday ? "bg-accent-dim" : ""
                  }`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-xs font-semibold ${
                        idx === 5 ? "text-blue-400" : idx === 6 ? "text-danger" : "text-secondary"
                      }`}
                    >
                      {WEEKDAY_LABELS[idx]}
                    </span>
                    <span className={`text-base font-bold ${isToday ? "text-accent" : "text-primary"}`}>
                      {day.getDate()}
                    </span>
                  </div>
                  {dayReservations.length > 0 && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                      {dayReservations.length}件
                    </span>
                  )}
                </div>

                {/* 予約カード一覧 */}
                <div className="flex flex-1 flex-col gap-1.5 p-2">
                  {loading ? (
                    <div className="space-y-1.5">
                      <div className="h-12 animate-pulse rounded-lg bg-inset" />
                      <div className="h-12 animate-pulse rounded-lg bg-inset" />
                    </div>
                  ) : dayReservations.length === 0 ? (
                    <p className="mt-2 text-center text-[11px] text-muted">予定なし</p>
                  ) : (
                    <>
                      {visible.map((r) => (
                        <ReservationCard key={r.id} reservation={r} />
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => toggleExpand(ymd)}
                          className="rounded-lg border border-dashed border-border-default px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
                        >
                          他{hiddenCount}件
                        </button>
                      )}
                      {expanded && dayReservations.length > MAX_VISIBLE_PER_DAY && (
                        <button
                          onClick={() => toggleExpand(ymd)}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:text-secondary"
                        >
                          閉じる
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
        {(["confirmed", "arrived", "in_progress", "completed"] as const).map((s) => {
          const meta = statusMeta(s);
          return (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.bar}`} />
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── 予約カード ───────────────────────────────────────────────────
function ReservationCard({ reservation }: { reservation: CalendarReservation }) {
  const meta = statusMeta(reservation.status);
  const time = shortTime(reservation.start_time);
  const vehicle = vehicleLabel(reservation);

  return (
    <Link
      href={`/admin/jobs/${reservation.id}`}
      className="group block overflow-hidden rounded-lg border border-border-subtle bg-surface-hover/60 transition-colors hover:border-accent/50 hover:bg-surface-hover"
    >
      <div className="flex">
        <span className={`w-1 shrink-0 ${meta.bar}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 px-2 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-xs font-semibold text-primary group-hover:text-accent">
              {reservation.customer_name ?? "顧客未設定"}
            </span>
            {time && <span className="shrink-0 text-[10px] tabular-nums text-muted">{time}</span>}
          </div>
          {vehicle && <p className="mt-0.5 truncate text-[11px] text-secondary">{vehicle}</p>}
          <p className="mt-0.5 truncate text-[10px] text-muted">{reservation.title}</p>
          <span className={`mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
      </div>
    </Link>
  );
}
