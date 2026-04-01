"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

// ─── Types ───────────────────────────────────────────────

type SlotStatus = "available" | "full" | "closed";

type SlotInfo = {
  start_time: string;
  end_time: string;
  available: number;
  max: number;
};

type DaySlots = {
  date: string;
  slots: SlotInfo[];
  hasAvailable: boolean;
};

type Step = "calendar" | "week-grid" | "time-select" | "form" | "confirm" | "done";

const WEEKDAYS_SHORT = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAYS_LONG = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

// ─── Helpers ─────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}

function parseDate(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatDateJa(s: string): string {
  const d = parseDate(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS_SHORT[d.getDay()]}）`;
}

function getMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: string; day: number; current: boolean }[] = [];

  // 前月パディング
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    cells.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, current: false });
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
      current: true,
    });
  }
  // 次月パディング
  const rem = 7 - (cells.length % 7);
  if (rem < 7) {
    for (let d = 1; d <= rem; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      cells.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, current: false });
    }
  }
  return cells;
}

function getWeekDates(anchor: Date): string[] {
  const dow = anchor.getDay();
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return toDateStr(d);
  });
}

// ─── Main Component ───────────────────────────────────────

export default function BookingPage() {
  const params = useParams() as { tenant: string };
  const tenantSlug = params.tenant ?? "";

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateStr(today), [today]);

  // ── view state ──
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [step, setStep] = useState<Step>("calendar");

  // ── calendar navigation ──
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [weekAnchor, setWeekAnchor] = useState(today);

  // ── selection ──
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);

  // ── slots cache: date → DaySlots ──
  const [slotsCache, setSlotsCache] = useState<Record<string, DaySlots>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());

  // ── form state ──
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formNote, setFormNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [doneReservation, setDoneReservation] = useState<{ date: string; start: string; end: string } | null>(null);

  // ── tenant info ──
  const [tenantName, setTenantName] = useState<string>("");

  // ─── Fetch slots for a given date (with cache) ────────────

  const fetchSlots = useCallback(
    async (date: string) => {
      if (slotsCache[date] !== undefined) return;
      if (loadingDates.has(date)) return;

      setLoadingDates((prev) => new Set(prev).add(date));
      try {
        const res = await fetch(`/api/external/booking?tenant_slug=${encodeURIComponent(tenantSlug)}&date=${date}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({ slots: [] }));
        const slots: SlotInfo[] = (j.slots ?? []).map((s: any) => ({
          start_time: s.start_time,
          end_time: s.end_time,
          available: s.available ?? 0,
          max: s.max ?? 1,
        }));
        // テナント名取得
        if (j.tenant_name) setTenantName(j.tenant_name);
        setSlotsCache((prev) => ({
          ...prev,
          [date]: {
            date,
            slots,
            hasAvailable: slots.some((s) => s.available > 0),
          },
        }));
      } catch {
        setSlotsCache((prev) => ({ ...prev, [date]: { date, slots: [], hasAvailable: false } }));
      } finally {
        setLoadingDates((prev) => {
          const s = new Set(prev);
          s.delete(date);
          return s;
        });
      }
    },
    [tenantSlug, slotsCache, loadingDates],
  );

  // ─── Prefetch visible dates ───────────────────────────────

  // Month view: prefetch all days of visible month
  useEffect(() => {
    if (viewMode !== "month") return;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dateStr >= todayStr) {
        fetchSlots(dateStr);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth, viewMode]);

  // Week view: prefetch 7 days of visible week
  useEffect(() => {
    if (viewMode !== "week") return;
    const weekDates = getWeekDates(weekAnchor);
    weekDates.forEach((d) => {
      if (d >= todayStr) fetchSlots(d);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekAnchor, viewMode]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleMonthPrev = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else setViewMonth(viewMonth - 1);
  };
  const handleMonthNext = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else setViewMonth(viewMonth + 1);
  };

  const handleWeekPrev = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() - 7);
    setWeekAnchor(d);
  };
  const handleWeekNext = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + 7);
    setWeekAnchor(d);
  };

  const handleDateClick = (date: string) => {
    if (date < todayStr) return;
    fetchSlots(date);
    setSelectedDate(date);
    setStep("time-select");
  };

  const handleSlotClick = (slot: SlotInfo) => {
    setSelectedSlot(slot);
    setStep("form");
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedSlot) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch("/api/external/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          customer_name: formName,
          customer_phone: formPhone || undefined,
          customer_email: formEmail || undefined,
          title: "Web予約",
          scheduled_date: selectedDate,
          start_time: selectedSlot.start_time.slice(0, 5),
          end_time: selectedSlot.end_time.slice(0, 5),
          note: formNote || undefined,
          source: "web",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j?.message ?? j?.error ?? `エラー (${res.status})`);
      }
      setDoneReservation({
        date: selectedDate,
        start: selectedSlot.start_time.slice(0, 5),
        end: selectedSlot.end_time.slice(0, 5),
      });
      // キャッシュ削除（空き状況を再取得させる）
      setSlotsCache((prev) => {
        const n = { ...prev };
        delete n[selectedDate];
        return n;
      });
      setStep("done");
    } catch (e: any) {
      setSubmitErr(e.message ?? "予約に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Slot status helper ───────────────────────────────────

  const dayStatus = (date: string): "available" | "full" | "closed" | "loading" | "past" => {
    if (date < todayStr) return "past";
    if (loadingDates.has(date)) return "loading";
    const d = slotsCache[date];
    if (!d) return "closed";
    if (d.slots.length === 0) return "closed";
    return d.hasAvailable ? "available" : "full";
  };

  // ─── Week grid time slots ─────────────────────────────────
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  // 全スロット時間帯を収集（union of all slots across week）
  const allTimes = useMemo(() => {
    const set = new Set<string>();
    weekDates.forEach((d) => {
      (slotsCache[d]?.slots ?? []).forEach((s) => set.add(s.start_time.slice(0, 5)));
    });
    return Array.from(set).sort();
  }, [weekDates, slotsCache]);

  // ─── Render ───────────────────────────────────────────────

  // ── Done screen ──
  if (step === "done" && doneReservation) {
    return (
      <div className="min-h-screen bg-[#f5f7f5] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#e8f5e9] flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-[#2e7d32]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">予約が完了しました</h2>
          <p className="text-sm text-gray-500 mb-6">ご予約ありがとうございます。</p>
          <div className="bg-[#f5f7f5] rounded-xl p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">日時</span>
              <span className="font-semibold text-gray-800">{formatDateJa(doneReservation.date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">時間</span>
              <span className="font-semibold text-gray-800">
                {doneReservation.start} 〜 {doneReservation.end}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">お名前</span>
              <span className="font-semibold text-gray-800">{formName} 様</span>
            </div>
          </div>
          <button
            onClick={() => {
              setStep("calendar");
              setSelectedDate(null);
              setSelectedSlot(null);
              setFormName("");
              setFormPhone("");
              setFormEmail("");
              setFormNote("");
              setDoneReservation(null);
            }}
            className="w-full py-3 rounded-xl bg-[#388e3c] text-white font-semibold text-sm hover:bg-[#2e7d32] transition-colors"
          >
            トップへ戻る
          </button>
        </div>
      </div>
    );
  }

  // ── Confirm screen ──
  if (step === "confirm" && selectedDate && selectedSlot) {
    return (
      <div className="min-h-screen bg-[#f5f7f5]">
        <Header tenantName={tenantName || tenantSlug} />
        <div className="max-w-lg mx-auto p-4">
          <StepIndicator current={3} />
          <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
            <h2 className="text-lg font-bold text-gray-900 mb-5">予約内容の確認</h2>
            <dl className="space-y-4">
              <Row label="日時" value={formatDateJa(selectedDate)} />
              <Row
                label="時間"
                value={`${selectedSlot.start_time.slice(0, 5)} 〜 ${selectedSlot.end_time.slice(0, 5)}`}
              />
              <Row label="お名前" value={`${formName} 様`} />
              {formPhone && <Row label="電話番号" value={formPhone} />}
              {formEmail && <Row label="メールアドレス" value={formEmail} />}
              {formNote && <Row label="備考" value={formNote} />}
            </dl>
            {submitErr && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {submitErr}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep("form")}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                修正する
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-[#388e3c] text-white text-sm font-semibold hover:bg-[#2e7d32] transition-colors disabled:opacity-60"
              >
                {submitting ? "送信中..." : "予約を確定する"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form screen ──
  if (step === "form" && selectedDate && selectedSlot) {
    const isValid = formName.trim().length > 0;
    return (
      <div className="min-h-screen bg-[#f5f7f5]">
        <Header tenantName={tenantName || tenantSlug} />
        <div className="max-w-lg mx-auto p-4">
          <StepIndicator current={2} />
          <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
            {/* 選択済み日時サマリー */}
            <div className="flex items-center gap-2 p-3 bg-[#e8f5e9] rounded-xl mb-5">
              <svg
                className="w-4 h-4 text-[#388e3c] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25"
                />
              </svg>
              <span className="text-sm font-semibold text-[#2e7d32]">
                {formatDateJa(selectedDate)}　{selectedSlot.start_time.slice(0, 5)} 〜{" "}
                {selectedSlot.end_time.slice(0, 5)}
              </span>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-5">お客様情報の入力</h2>

            <div className="space-y-4">
              <FormField label="お名前" required>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="山田 太郎"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#388e3c] focus:border-transparent"
                />
              </FormField>
              <FormField label="電話番号">
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="090-0000-0000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#388e3c] focus:border-transparent"
                />
              </FormField>
              <FormField label="メールアドレス">
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#388e3c] focus:border-transparent"
                />
              </FormField>
              <FormField label="備考・ご要望">
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="ご要望があればご記入ください"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#388e3c] focus:border-transparent resize-none"
                />
              </FormField>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep("time-select")}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                戻る
              </button>
              <button
                onClick={() => setStep("confirm")}
                disabled={!isValid}
                className="flex-1 py-3 rounded-xl bg-[#388e3c] text-white text-sm font-semibold hover:bg-[#2e7d32] transition-colors disabled:opacity-40"
              >
                確認へ進む
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Time select screen ──
  if (step === "time-select" && selectedDate) {
    const dayData = slotsCache[selectedDate];
    const isLoading = loadingDates.has(selectedDate);
    return (
      <div className="min-h-screen bg-[#f5f7f5]">
        <Header tenantName={tenantName || tenantSlug} />
        <div className="max-w-lg mx-auto p-4">
          <StepIndicator current={1} />
          <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setStep("calendar")}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <h2 className="text-base font-bold text-gray-900">{formatDateJa(selectedDate)}</h2>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-sm text-gray-400">空き状況を確認中...</div>
            ) : !dayData || dayData.slots.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-sm text-gray-500">この日は予約枠が設定されていません。</p>
                <button
                  onClick={() => setStep("calendar")}
                  className="mt-4 text-sm text-[#388e3c] font-medium underline"
                >
                  別の日を選ぶ
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">ご希望の時間帯をお選びください</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {dayData.slots.map((slot) => {
                    const avail = slot.available > 0;
                    return (
                      <button
                        key={slot.start_time}
                        onClick={() => avail && handleSlotClick(slot)}
                        disabled={!avail}
                        className={`relative flex flex-col items-center justify-center rounded-xl py-4 px-3 border-2 transition-all ${
                          avail
                            ? "border-[#388e3c] bg-white hover:bg-[#e8f5e9] active:scale-95 cursor-pointer"
                            : "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                        }`}
                      >
                        <span className={`text-xl font-bold mb-0.5 ${avail ? "text-[#2e7d32]" : "text-gray-300"}`}>
                          {avail ? "○" : "×"}
                        </span>
                        <span className={`text-sm font-semibold ${avail ? "text-gray-800" : "text-gray-400"}`}>
                          {slot.start_time.slice(0, 5)}
                        </span>
                        <span className={`text-xs ${avail ? "text-gray-400" : "text-gray-300"}`}>
                          〜 {slot.end_time.slice(0, 5)}
                        </span>
                        {avail && (
                          <span className="absolute top-1.5 right-1.5 text-[10px] bg-[#e8f5e9] text-[#388e3c] rounded-full px-1.5 py-0.5 font-medium">
                            残{slot.available}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Calendar / Week grid screen ──
  const monthCells = getMonthCells(viewYear, viewMonth);
  const maxFutureDate = (() => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return toDateStr(d);
  })();

  return (
    <div className="min-h-screen bg-[#f5f7f5]">
      <Header tenantName={tenantName || tenantSlug} />

      {/* ── view mode toggle + nav ── */}
      <div className="bg-[#388e3c] text-white">
        {/* View toggle */}
        <div className="flex border-b border-[#2e7d32]">
          <button
            onClick={() => setViewMode("month")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${viewMode === "month" ? "bg-[#2e7d32]" : "hover:bg-[#2e7d32]/40"}`}
          >
            月
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${viewMode === "week" ? "bg-[#2e7d32]" : "hover:bg-[#2e7d32]/40"}`}
          >
            週
          </button>
        </div>

        {/* Nav bar */}
        {viewMode === "month" ? (
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={handleMonthPrev}
              disabled={viewYear === today.getFullYear() && viewMonth === today.getMonth()}
              className="p-2 rounded-full hover:bg-[#2e7d32] disabled:opacity-30 transition-colors"
              aria-label="前月"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-base font-bold">
              {viewYear}年{viewMonth + 1}月
            </span>
            <button
              onClick={handleMonthNext}
              disabled={`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01` > maxFutureDate}
              className="p-2 rounded-full hover:bg-[#2e7d32] disabled:opacity-30 transition-colors"
              aria-label="翌月"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={handleWeekPrev}
              disabled={weekDates[0] <= todayStr}
              className="p-2 rounded-full hover:bg-[#2e7d32] disabled:opacity-30 transition-colors"
              aria-label="前週"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-sm font-bold">
              {weekDates[0].slice(5).replace("-", "/")} 〜 {weekDates[6].slice(5).replace("-", "/")}
            </span>
            <button
              onClick={handleWeekNext}
              disabled={weekDates[6] > maxFutureDate}
              className="p-2 rounded-full hover:bg-[#2e7d32] disabled:opacity-30 transition-colors"
              aria-label="翌週"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Month Calendar view ── */}
      {viewMode === "month" && (
        <div className="bg-white shadow-sm">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEKDAYS_SHORT.map((wd, i) => (
              <div
                key={wd}
                className={`py-2 text-center text-xs font-bold tracking-widest ${
                  i === 0 ? "text-red-400" : i === 6 ? "text-blue-500" : "text-gray-400"
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {monthCells.map((cell) => {
              const status = dayStatus(cell.date);
              const isToday = cell.date === todayStr;
              const isPast = status === "past";
              const dow = new Date(cell.date).getDay();
              const isSat = dow === 6;
              const isSun = dow === 0;

              return (
                <button
                  key={cell.date}
                  onClick={() => !isPast && cell.current && handleDateClick(cell.date)}
                  disabled={isPast || !cell.current}
                  className={`relative min-h-[64px] border-b border-r border-gray-50 flex flex-col items-center pt-2 pb-1 transition-colors
                    ${!cell.current ? "bg-gray-50/50" : ""}
                    ${isSat && cell.current ? "bg-blue-50/20" : ""}
                    ${isSun && cell.current ? "bg-red-50/20" : ""}
                    ${!isPast && cell.current ? "hover:bg-[#e8f5e9] cursor-pointer active:scale-95" : "cursor-default"}
                  `}
                >
                  {/* Date number */}
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold mb-1 ${
                      isToday
                        ? "bg-[#388e3c] text-white"
                        : !cell.current
                          ? "text-gray-300"
                          : isPast
                            ? "text-gray-300"
                            : isSun
                              ? "text-red-400"
                              : isSat
                                ? "text-blue-500"
                                : "text-gray-800"
                    }`}
                  >
                    {cell.day}
                  </span>

                  {/* Availability badge */}
                  {cell.current && !isPast && (
                    <span
                      className={`text-lg leading-none font-bold ${
                        status === "loading"
                          ? "text-gray-200 animate-pulse"
                          : status === "available"
                            ? "text-[#388e3c]"
                            : status === "full"
                              ? "text-gray-300"
                              : "text-gray-200"
                      }`}
                    >
                      {status === "loading" ? "…" : status === "available" ? "○" : status === "full" ? "×" : "–"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Week Grid view ── */}
      {viewMode === "week" && (
        <div className="bg-white shadow-sm overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-14 border-b border-r border-gray-100 py-2 text-center text-xs text-gray-400 font-medium bg-gray-50">
                  時刻
                </th>
                {weekDates.map((date) => {
                  const dow = new Date(date).getDay();
                  const d = parseDate(date);
                  const isToday = date === todayStr;
                  return (
                    <th
                      key={date}
                      className={`border-b border-r border-gray-100 py-2 text-center ${
                        dow === 0 ? "bg-red-50/50" : dow === 6 ? "bg-blue-50/50" : "bg-white"
                      }`}
                    >
                      <div
                        className={`text-xs font-bold ${dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-500" : "text-gray-500"}`}
                      >
                        {WEEKDAYS_SHORT[dow]}
                      </div>
                      <div className={`text-sm font-bold mt-0.5 ${isToday ? "text-[#388e3c]" : "text-gray-800"}`}>
                        {d.getMonth() + 1}/{d.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allTimes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    この週は予約枠がありません
                  </td>
                </tr>
              ) : (
                allTimes.map((time) => (
                  <tr key={time} className="group">
                    <td className="border-b border-r border-gray-100 py-3 text-center text-xs text-gray-400 font-medium bg-gray-50 w-14">
                      {time}
                    </td>
                    {weekDates.map((date) => {
                      const dow = new Date(date).getDay();
                      const dayData = slotsCache[date];
                      const isLoading = loadingDates.has(date);
                      const isPast = date < todayStr;
                      const slot = dayData?.slots.find((s) => s.start_time.slice(0, 5) === time);

                      let cellContent: React.ReactNode;
                      if (isPast) {
                        cellContent = <span className="text-gray-200 text-base">–</span>;
                      } else if (isLoading) {
                        cellContent = <span className="text-gray-200 text-base animate-pulse">…</span>;
                      } else if (!slot) {
                        cellContent = <span className="text-gray-200 text-base">–</span>;
                      } else if (slot.available > 0) {
                        cellContent = (
                          <button
                            onClick={() => handleDateClick(date)}
                            className="flex flex-col items-center gap-0.5 group/cell"
                          >
                            <span className="text-[#388e3c] text-xl font-bold group-hover/cell:scale-110 transition-transform">
                              ○
                            </span>
                          </button>
                        );
                      } else {
                        cellContent = <span className="text-gray-300 text-base">×</span>;
                      }

                      return (
                        <td
                          key={date}
                          className={`border-b border-r border-gray-100 py-3 text-center align-middle transition-colors ${
                            dow === 0 ? "bg-red-50/30" : dow === 6 ? "bg-blue-50/30" : ""
                          } ${!isPast && slot?.available ? "hover:bg-[#e8f5e9]" : ""}`}
                        >
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center justify-center gap-5 py-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="text-[#388e3c] font-bold text-base">○</span> 予約可
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-300 font-bold text-base">×</span> 満席
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-200 font-bold text-base">–</span> 受付なし
        </span>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            日付をタップして
            <br />
            空き時間を確認
          </div>
          <a
            href={`/customer/${tenantSlug}`}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#388e3c] text-white rounded-full text-sm font-semibold shadow hover:bg-[#2e7d32] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
            店舗情報
          </a>
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-20" />
    </div>
  );
}

// ─── Sub Components ───────────────────────────────────────

function Header({ tenantName }: { tenantName: string }) {
  return (
    <header className="bg-[#388e3c] text-white px-4 py-4">
      <h1 className="text-base font-bold">{tenantName || "予約"}</h1>
      <p className="text-xs text-[#a5d6a7] mt-0.5">ご希望の日時をお選びください</p>
    </header>
  );
}

function StepIndicator({ current }: { current: number }) {
  const steps = ["日時を選択", "情報を入力", "確認・送信"];
  return (
    <div className="flex items-center gap-0 mt-4">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const active = stepNum === current;
        const done = stepNum < current;
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done
                    ? "bg-[#388e3c] border-[#388e3c] text-white"
                    : active
                      ? "bg-white border-[#388e3c] text-[#388e3c]"
                      : "bg-white border-gray-200 text-gray-300"
                }`}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span className={`mt-1 text-[10px] font-medium ${active ? "text-[#388e3c]" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 transition-all ${done ? "bg-[#388e3c]" : "bg-gray-100"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4 py-3 border-b border-gray-50 last:border-0">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm font-semibold text-gray-800 text-right">{value}</dd>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="ml-1 text-red-500 text-xs">*必須</span>}
      </label>
      {children}
    </div>
  );
}
