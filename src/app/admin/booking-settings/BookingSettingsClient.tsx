"use client";

import { useState, useEffect, useCallback } from "react";

// ─── 型定義 ──────────────────────────────────────────────────────
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface BookingSlot {
  id?: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
  end_time: string;
  max_bookings: number;
  is_active: boolean;
  label?: string;
  _deleted?: boolean;
  _new?: boolean;
}

interface ClosedDay {
  id?: string;
  type: "weekly" | "specific";
  day_of_week?: DayOfWeek;
  closed_date?: string; // YYYY-MM-DD
  note?: string;
  _deleted?: boolean;
  _new?: boolean;
}

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ─── ユーティリティ ───────────────────────────────────────────────
function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
}
const TIME_OPTIONS = generateTimeOptions();

function newSlotId() {
  return `new_${Math.random().toString(36).slice(2)}`;
}
function newClosedId() {
  return `new_${Math.random().toString(36).slice(2)}`;
}

// ─── 共通インプット / セレクト スタイル ─────────────────────────
const inputCls =
  "text-sm border border-border-default rounded-md px-2 py-1 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const selectCls =
  "text-sm border border-border-default rounded-md px-2 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── メインコンポーネント ─────────────────────────────────────────
export default function BookingSettingsClient() {
  const [slots, setSlots] = useState<(BookingSlot & { _tempId: string })[]>([]);
  const [closedDays, setClosedDays] = useState<(ClosedDay & { _tempId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"slots" | "closed">("slots");

  // 追加フォーム用 state
  const [newSlot, setNewSlot] = useState<Partial<BookingSlot>>({
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
    max_bookings: 1,
    is_active: true,
    label: "",
  });
  const [newSpecificDate, setNewSpecificDate] = useState("");
  const [newSpecificNote, setNewSpecificNote] = useState("");
  const [weeklyClosedDows, setWeeklyClosedDows] = useState<Set<number>>(new Set());

  // ─── データ取得 ───
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/booking-settings");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setSlots((data.slots ?? []).map((s: BookingSlot) => ({ ...s, _tempId: s.id ?? newSlotId() })));
      const cds: (ClosedDay & { _tempId: string })[] = (data.closed_days ?? []).map((c: ClosedDay) => ({
        ...c,
        _tempId: c.id ?? newClosedId(),
      }));
      setClosedDays(cds);
      const wSet = new Set<number>();
      cds.forEach((c) => {
        if (c.type === "weekly" && c.day_of_week != null) wSet.add(c.day_of_week);
      });
      setWeeklyClosedDows(wSet);
    } catch (e) {
      console.error(e);
      showToast("error", "設定の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ─── スロット操作 ───
  function handleSlotChange(tempId: string, key: keyof BookingSlot, value: unknown) {
    setSlots((prev) => prev.map((s) => (s._tempId === tempId ? { ...s, [key]: value } : s)));
  }

  function handleDeleteSlot(tempId: string) {
    setSlots((prev) => prev.map((s) => (s._tempId === tempId ? { ...s, _deleted: true } : s)));
  }

  function handleAddSlot() {
    if (!newSlot.start_time || !newSlot.end_time) return;
    if (newSlot.start_time >= newSlot.end_time) {
      showToast("error", "終了時刻は開始時刻より後にしてください");
      return;
    }
    const tempId = newSlotId();
    setSlots((prev) => [
      ...prev,
      {
        _tempId: tempId,
        _new: true,
        day_of_week: (newSlot.day_of_week ?? 1) as DayOfWeek,
        start_time: newSlot.start_time!,
        end_time: newSlot.end_time!,
        max_bookings: newSlot.max_bookings ?? 1,
        is_active: newSlot.is_active ?? true,
        label: newSlot.label ?? "",
      },
    ]);
    setNewSlot((prev) => ({ ...prev, label: "" }));
  }

  // ─── 毎週定休曜日トグル ───
  function toggleWeeklyClosed(dow: number) {
    setWeeklyClosedDows((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) {
        next.delete(dow);
        setClosedDays((cds) =>
          cds.map((c) => (c.type === "weekly" && c.day_of_week === dow ? { ...c, _deleted: true } : c)),
        );
      } else {
        next.add(dow);
        setClosedDays((cds) => {
          const existing = cds.find((c) => c.type === "weekly" && c.day_of_week === dow);
          if (existing) {
            return cds.map((c) => (c.type === "weekly" && c.day_of_week === dow ? { ...c, _deleted: false } : c));
          }
          return [...cds, { _tempId: newClosedId(), _new: true, type: "weekly", day_of_week: dow as DayOfWeek }];
        });
      }
      return next;
    });
  }

  // ─── 特定日定休追加 ───
  function handleAddSpecificClosed() {
    if (!newSpecificDate) {
      showToast("error", "日付を入力してください");
      return;
    }
    const already = closedDays.some((c) => c.type === "specific" && c.closed_date === newSpecificDate && !c._deleted);
    if (already) {
      showToast("error", "すでに登録されている日付です");
      return;
    }
    setClosedDays((prev) => [
      ...prev,
      {
        _tempId: newClosedId(),
        _new: true,
        type: "specific",
        closed_date: newSpecificDate,
        note: newSpecificNote || undefined,
      },
    ]);
    setNewSpecificDate("");
    setNewSpecificNote("");
  }

  function handleDeleteSpecificClosed(tempId: string) {
    setClosedDays((prev) => prev.map((c) => (c._tempId === tempId ? { ...c, _deleted: true } : c)));
  }

  // ─── 保存 ───
  async function handleSave() {
    setSaving(true);
    try {
      const slotsToSave = slots
        .filter((s) => !s._deleted && !s._new)
        .map(({ _tempId, _deleted, _new, ...rest }) => rest);
      const newSlots = slots
        .filter((s) => s._new && !s._deleted)
        .map(({ _tempId, _deleted, _new, id, ...rest }) => rest);
      const deletedSlotIds = slots.filter((s) => s._deleted && s.id).map((s) => s.id!);

      const closedToSave = closedDays
        .filter((c) => !c._deleted && !c._new)
        .map(({ _tempId, _deleted, _new, ...rest }) => rest);
      const newClosed = closedDays
        .filter((c) => c._new && !c._deleted)
        .map(({ _tempId, _deleted, _new, id, ...rest }) => rest);
      const deletedClosedIds = closedDays.filter((c) => c._deleted && c.id).map((c) => c.id!);

      const body = {
        slots: [...slotsToSave, ...newSlots],
        closed_days: [...closedToSave, ...newClosed],
        deleted_slot_ids: deletedSlotIds,
        deleted_closed_day_ids: deletedClosedIds,
      };

      const res = await fetch("/api/admin/booking-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("save failed");
      showToast("success", "設定を保存しました");
      await fetchSettings();
    } catch (e) {
      console.error(e);
      showToast("error", "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  // ─── 表示用 ───
  const activeSlots = slots.filter((s) => !s._deleted);
  const activeSpecificCloseds = closedDays.filter((c) => c.type === "specific" && !c._deleted);

  // ─── レンダリング ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">外部予約受付設定</h1>
          <p className="text-sm text-secondary mt-1">お客様向け予約ページの受付時間・定休日を管理します</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>

      {/* タブ */}
      <div className="flex border-b border-border-default mb-6">
        {(["slots", "closed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {tab === "slots" ? "受付時間スロット" : "定休日設定"}
          </button>
        ))}
      </div>

      {/* ─── タブ: 受付時間スロット ─── */}
      {activeTab === "slots" && (
        <div className="space-y-4">
          {/* スロット一覧（曜日グループ） */}
          {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((dow) => {
            const daySlots = activeSlots.filter((s) => s.day_of_week === dow);
            const isClosed = weeklyClosedDows.has(dow);
            return (
              <div
                key={dow}
                className={`bg-surface rounded-xl border border-border-default shadow-sm overflow-hidden ${isClosed ? "opacity-50" : ""}`}
              >
                {/* 曜日ヘッダー */}
                <div
                  className={`flex items-center justify-between px-4 py-3 ${
                    dow === 0 ? "bg-danger-dim" : dow === 6 ? "bg-accent-dim" : "bg-inset"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold text-base ${
                        dow === 0 ? "text-danger" : dow === 6 ? "text-accent" : "text-primary"
                      }`}
                    >
                      {DAY_NAMES[dow]}曜日
                    </span>
                    {isClosed && (
                      <span className="text-xs bg-muted/40 text-secondary px-2 py-0.5 rounded-full">定休日</span>
                    )}
                  </div>
                  <span className="text-xs text-muted">{daySlots.length}スロット</span>
                </div>

                {/* スロット行 */}
                <div className="divide-y divide-border-subtle">
                  {daySlots.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted italic">スロットなし</p>
                  ) : (
                    daySlots.map((slot) => (
                      <div key={slot._tempId} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                        {/* ON/OFFトグル */}
                        <button
                          onClick={() => handleSlotChange(slot._tempId, "is_active", !slot.is_active)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            slot.is_active ? "bg-accent" : "bg-border-strong"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 bg-inverse rounded-full shadow transition-transform ${
                              slot.is_active ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </button>

                        {/* 開始・終了時刻 */}
                        <select
                          value={slot.start_time.slice(0, 5)}
                          onChange={(e) => handleSlotChange(slot._tempId, "start_time", e.target.value)}
                          className={selectCls}
                        >
                          {TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted text-sm">〜</span>
                        <select
                          value={slot.end_time.slice(0, 5)}
                          onChange={(e) => handleSlotChange(slot._tempId, "end_time", e.target.value)}
                          className={selectCls}
                        >
                          {TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>

                        {/* 同時受付数 */}
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() =>
                              handleSlotChange(slot._tempId, "max_bookings", Math.max(1, slot.max_bookings - 1))
                            }
                            className="w-6 h-6 rounded-full bg-inset hover:bg-surface-active flex items-center justify-center text-sm font-bold text-primary"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-medium text-primary">{slot.max_bookings}</span>
                          <button
                            onClick={() =>
                              handleSlotChange(slot._tempId, "max_bookings", Math.min(99, slot.max_bookings + 1))
                            }
                            className="w-6 h-6 rounded-full bg-inset hover:bg-surface-active flex items-center justify-center text-sm font-bold text-primary"
                          >
                            ＋
                          </button>
                          <span className="text-xs text-muted ml-1">名</span>
                        </div>

                        {/* ラベル */}
                        <input
                          type="text"
                          value={slot.label ?? ""}
                          onChange={(e) => handleSlotChange(slot._tempId, "label", e.target.value)}
                          placeholder="ラベル（任意）"
                          className={`flex-1 min-w-0 ${inputCls}`}
                        />

                        {/* 削除 */}
                        <button
                          onClick={() => handleDeleteSlot(slot._tempId)}
                          className="text-muted hover:text-danger transition-colors flex-shrink-0"
                          title="削除"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* スロット追加フォーム */}
          <div className="bg-accent-dim border border-accent/20 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent-text mb-3">スロットを追加</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-secondary mb-1">曜日</label>
                <select
                  value={newSlot.day_of_week ?? 1}
                  onChange={(e) => setNewSlot((p) => ({ ...p, day_of_week: Number(e.target.value) as DayOfWeek }))}
                  className={selectCls}
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={i} value={i}>
                      {d}曜日
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">開始</label>
                <select
                  value={newSlot.start_time ?? "09:00"}
                  onChange={(e) => setNewSlot((p) => ({ ...p, start_time: e.target.value }))}
                  className={selectCls}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">終了</label>
                <select
                  value={newSlot.end_time ?? "10:00"}
                  onChange={(e) => setNewSlot((p) => ({ ...p, end_time: e.target.value }))}
                  className={selectCls}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">同時受付数</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setNewSlot((p) => ({ ...p, max_bookings: Math.max(1, (p.max_bookings ?? 1) - 1) }))}
                    className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-medium text-primary">{newSlot.max_bookings ?? 1}</span>
                  <button
                    onClick={() => setNewSlot((p) => ({ ...p, max_bookings: Math.min(99, (p.max_bookings ?? 1) + 1) }))}
                    className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                  >
                    ＋
                  </button>
                </div>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-secondary mb-1">ラベル（任意）</label>
                <input
                  type="text"
                  value={newSlot.label ?? ""}
                  onChange={(e) => setNewSlot((p) => ({ ...p, label: e.target.value }))}
                  placeholder="例: 午前の部"
                  className={`w-full ${inputCls}`}
                />
              </div>
              <button
                onClick={handleAddSlot}
                className="flex items-center gap-1 px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── タブ: 定休日設定 ─── */}
      {activeTab === "closed" && (
        <div className="space-y-6">
          {/* 毎週定休日 */}
          <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5">
            <h3 className="text-base font-semibold text-primary mb-1">毎週の定休日</h3>
            <p className="text-xs text-secondary mb-4">クリックでオン/オフを切り替えます</p>
            <div className="flex gap-2 flex-wrap">
              {DAY_NAMES.map((name, dow) => (
                <button
                  key={dow}
                  onClick={() => toggleWeeklyClosed(dow)}
                  className={`w-12 h-12 rounded-full font-bold text-sm transition-all ${
                    weeklyClosedDows.has(dow)
                      ? dow === 0
                        ? "bg-danger text-white shadow-md scale-105"
                        : dow === 6
                          ? "bg-accent text-white shadow-md scale-105"
                          : "bg-primary text-inverse shadow-md scale-105"
                      : "bg-inset text-secondary hover:bg-surface-active"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {weeklyClosedDows.size > 0 && (
              <p className="mt-3 text-sm text-secondary">
                毎週
                {[...weeklyClosedDows]
                  .sort()
                  .map((d) => DAY_NAMES[d])
                  .join("・")}
                曜日は定休日です
              </p>
            )}
          </div>

          {/* 特定日定休 */}
          <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5">
            <h3 className="text-base font-semibold text-primary mb-1">特定日の定休</h3>
            <p className="text-xs text-secondary mb-4">年末年始・祝日・臨時休業などを個別に設定します</p>

            {/* 追加フォーム */}
            <div className="flex flex-wrap gap-3 mb-4 bg-accent-dim border border-accent/20 rounded-lg p-4">
              <div>
                <label className="block text-xs text-secondary mb-1">日付</label>
                <input
                  type="date"
                  value={newSpecificDate}
                  onChange={(e) => setNewSpecificDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-secondary mb-1">備考（任意）</label>
                <input
                  type="text"
                  value={newSpecificNote}
                  onChange={(e) => setNewSpecificNote(e.target.value)}
                  placeholder="例: 年末年始"
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddSpecificClosed}
                  className="flex items-center gap-1 px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  追加
                </button>
              </div>
            </div>

            {/* 登録済み特定日一覧 */}
            {activeSpecificCloseds.length === 0 ? (
              <p className="text-sm text-muted italic py-4 text-center">特定日の定休はありません</p>
            ) : (
              <div className="divide-y divide-border-subtle">
                {activeSpecificCloseds
                  .sort((a, b) => (a.closed_date ?? "").localeCompare(b.closed_date ?? ""))
                  .map((cd) => (
                    <div
                      key={cd._tempId}
                      className="flex items-center justify-between py-3 hover:bg-surface-hover px-2 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-inset flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-secondary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-primary">{cd.closed_date?.replace(/-/g, "/")}</p>
                          {cd.note && <p className="text-xs text-secondary">{cd.note}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSpecificClosed(cd._tempId)}
                        className="text-muted hover:text-danger transition-colors"
                        title="削除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 z-50 transition-all ${
            toast.type === "success" ? "bg-accent text-white" : "bg-danger text-white"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
