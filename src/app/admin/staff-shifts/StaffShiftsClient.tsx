"use client";

import { useEffect, useRef, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";

// ─── 型定義 ──────────────────────────────────────────────────────
interface AttendanceRecord {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  work_minutes: number | null;
}

interface StaffShift {
  id: string;
  user_id: string;
  staff_name: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  notes: string | null;
  attendance: AttendanceRecord | null;
}

interface ShiftsResponse {
  ok: boolean;
  from: string;
  to: string;
  is_admin: boolean;
  caller_user_id: string;
  shifts: StaffShift[];
  attendance: AttendanceRecord[];
}

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── 日付ユーティリティ ───────────────────────────────────────────
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

/** "HH:MM:SS" / "HH:MM" → "HH:MM"。 */
function shortTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

/** ISO timestamp → "HH:MM" (ローカル)。 */
function clockTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 予定 (shift) と実績 (attendance) からセルの状態を決める。
 *   - planned-only : 予定あり・実績なし (青)
 *   - match        : 予定どおり出退勤 (緑)
 *   - differs      : 実績はあるが予定とズレ (橙)
 *   - no-show      : 予定あり・当日を過ぎて実績なし (赤)
 */
type CellState = "planned" | "match" | "differs" | "no-show";

function cellState(shift: StaffShift, todayStr: string): CellState {
  const att = shift.attendance;
  if (!att || !att.clock_in) {
    // 当日を過ぎても実績がなければ no-show。未来日は planned。
    return shift.shift_date < todayStr ? "no-show" : "planned";
  }
  // 実績の出勤/退勤時刻が予定とおおむね一致 (±15分) なら match。
  const planStart = shift.start_time.slice(0, 5);
  const planEnd = shift.end_time.slice(0, 5);
  const actStart = clockTime(att.clock_in);
  const actEnd = att.clock_out ? clockTime(att.clock_out) : "";

  const within15 = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    return Math.abs(toMin(a) - toMin(b)) <= 15;
  };
  if (within15(planStart, actStart) && (!actEnd || within15(planEnd, actEnd))) return "match";
  return "differs";
}

const STATE_META: Record<CellState, { ring: string; bg: string; label: string }> = {
  planned: { ring: "ring-blue-500/40", bg: "bg-blue-500/10", label: "予定" },
  match: { ring: "ring-green-500/40", bg: "bg-green-500/10", label: "予定どおり" },
  differs: { ring: "ring-orange-500/40", bg: "bg-orange-500/10", label: "予定とズレ" },
  "no-show": { ring: "ring-red-500/50", bg: "bg-red-500/10", label: "未出勤" },
};

// ─── メインコンポーネント ─────────────────────────────────────────
export default function StaffShiftsClient() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [data, setData] = useState<ShiftsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editCell, setEditCell] = useState<{ userId: string; userName: string; date: string } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(type: "success" | "error", msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toYmd(weekDates[0]);
  const to = toYmd(weekDates[6]);
  const todayStr = toYmd(new Date());

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff-shifts?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as ShiftsResponse;
      setData(json);
    } catch (e) {
      console.error(e);
      showToast("error", "シフトの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchData();
  }, [from, to]);

  const isAdmin = data?.is_admin ?? false;
  const shifts = data?.shifts ?? [];
  const callerUserId = data?.caller_user_id;

  // スタッフ行を構成 (シフトに登場する user_id の集合)。
  const staffRowMap = new Map<string, string>();
  for (const s of shifts) {
    if (!staffRowMap.has(s.user_id)) staffRowMap.set(s.user_id, s.staff_name ?? s.user_id);
  }
  if (callerUserId && !staffRowMap.has(callerUserId)) staffRowMap.set(callerUserId, "自分");
  const staffRows = Array.from(staffRowMap.entries())
    .map(([user_id, name]) => ({ user_id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const shiftByKey = new Map<string, StaffShift>();
  for (const s of shifts) shiftByKey.set(`${s.user_id}|${s.shift_date}`, s);

  function shiftWeek(deltaWeeks: number) {
    setWeekStart((prev) => addDays(prev, deltaWeeks * 7));
  }

  // 前週コピー ------------------------------------------------------
  async function copyPreviousWeek() {
    if (!isAdmin) return;
    setBusy(true);
    try {
      // 前週のシフトを取得。
      const prevFrom = toYmd(addDays(weekStart, -7));
      const prevTo = toYmd(addDays(weekStart, -1));
      const res = await fetch(`/api/admin/staff-shifts?from=${prevFrom}&to=${prevTo}`);
      if (!res.ok) throw new Error("前週の取得に失敗しました");
      const prev = (await res.json()) as ShiftsResponse;
      const prevShifts = prev.shifts ?? [];
      if (prevShifts.length === 0) {
        showToast("error", "前週にコピー元のシフトがありません");
        setBusy(false);
        return;
      }
      // 各前週シフトを今週の同曜日へずらして bulk upsert。
      const payload = prevShifts.map((s) => ({
        user_id: s.user_id,
        shift_date: toYmd(addDays(new Date(`${s.shift_date}T00:00:00`), 7)),
        start_time: s.start_time.slice(0, 5),
        end_time: s.end_time.slice(0, 5),
        break_minutes: s.break_minutes,
        notes: s.notes,
        staff_name: s.staff_name,
      }));

      const bulkRes = await fetch("/api/admin/staff-shifts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: payload.slice(0, 50) }),
      });
      if (!bulkRes.ok) {
        const err = await bulkRes.json().catch(() => ({}));
        throw new Error(err.error?.message ?? "コピーに失敗しました");
      }
      const result = (await bulkRes.json()) as { created: number; updated: number };
      showToast("success", `前週分をコピーしました (新規${result.created}件 / 更新${result.updated}件)`);
      await fetchData();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "コピーに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const weekLabel = `${from} 〜 ${to}`;

  return (
    <div className="mx-auto max-w-[1600px] pb-20">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">シフト管理</h1>
          <p className="mt-1 text-sm text-secondary">週次のシフトを作成し、勤怠の実績と照合します</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-hover"
          >
            ← 前週
          </button>
          <button
            onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-hover"
          >
            今週
          </button>
          <button
            onClick={() => shiftWeek(1)}
            className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-hover"
          >
            次週 →
          </button>
        </div>
      </div>

      {/* ツールバー */}
      <div className="glass-card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-sm font-semibold text-primary">{weekLabel}</span>
        <div className="flex items-center gap-3">
          <Legend />
          {isAdmin && (
            <MutationGuard minRole="admin">
              <button onClick={copyPreviousWeek} disabled={busy} className="btn-secondary disabled:opacity-40">
                週テンプレートをコピー
              </button>
            </MutationGuard>
          )}
        </div>
      </div>

      {/* 週グリッド */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface-hover p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">
                  スタッフ
                </th>
                {weekDates.map((d, i) => {
                  const ymd = toYmd(d);
                  const isToday = ymd === todayStr;
                  return (
                    <th
                      key={ymd}
                      className={`min-w-[120px] p-3 text-center text-xs font-semibold ${
                        isToday ? "text-accent" : "text-muted"
                      }`}
                    >
                      <div>{WEEKDAY_LABELS[i]}</div>
                      <div className="font-normal">
                        {d.getMonth() + 1}/{d.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staffRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted">
                    今週のシフトはまだありません。セルをクリックして追加してください。
                  </td>
                </tr>
              ) : (
                staffRows.map((staff) => (
                  <tr key={staff.user_id} className="border-t border-border-subtle">
                    <td className="sticky left-0 z-10 bg-surface p-3 font-medium text-primary">{staff.name}</td>
                    {weekDates.map((d) => {
                      const ymd = toYmd(d);
                      const shift = shiftByKey.get(`${staff.user_id}|${ymd}`) ?? null;
                      const canEdit = isAdmin || staff.user_id === data?.caller_user_id;
                      return (
                        <td key={ymd} className="p-1.5 align-top">
                          <ShiftCell
                            shift={shift}
                            todayStr={todayStr}
                            editable={canEdit}
                            onClick={() =>
                              canEdit && setEditCell({ userId: staff.user_id, userName: staff.name, date: ymd })
                            }
                          />
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

      {/* 編集ダイアログ */}
      {editCell && (
        <EditShiftDialog
          userId={editCell.userId}
          userName={editCell.userName}
          date={editCell.date}
          existing={shiftByKey.get(`${editCell.userId}|${editCell.date}`) ?? null}
          onClose={() => setEditCell(null)}
          onSaved={async (msg) => {
            setEditCell(null);
            showToast("success", msg);
            await fetchData();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── セル ─────────────────────────────────────────────────────────
function ShiftCell({
  shift,
  todayStr,
  editable,
  onClick,
}: {
  shift: StaffShift | null;
  todayStr: string;
  editable: boolean;
  onClick: () => void;
}) {
  if (!shift) {
    return (
      <button
        onClick={onClick}
        disabled={!editable}
        className="flex h-[60px] w-full items-center justify-center rounded-lg border border-dashed border-border-subtle text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:hover:border-border-subtle disabled:hover:text-muted"
      >
        {editable ? "+ 追加" : "—"}
      </button>
    );
  }
  const state = cellState(shift, todayStr);
  const meta = STATE_META[state];
  const att = shift.attendance;
  return (
    <button
      onClick={onClick}
      disabled={!editable}
      className={`flex h-[60px] w-full flex-col items-start justify-center gap-0.5 rounded-lg px-2 py-1 text-left ring-1 transition-colors ${meta.ring} ${meta.bg} disabled:cursor-default`}
    >
      <span className="text-xs font-semibold text-primary">
        {shortTime(shift.start_time)}–{shortTime(shift.end_time)}
      </span>
      {att?.clock_in ? (
        <span className="text-[10px] text-secondary">
          実 {clockTime(att.clock_in)}
          {att.clock_out ? `–${clockTime(att.clock_out)}` : "–"}
        </span>
      ) : (
        <span className="text-[10px] text-muted">{meta.label}</span>
      )}
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
      {(["planned", "match", "differs", "no-show"] as const).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ring-1 ${STATE_META[s].ring} ${STATE_META[s].bg}`} />
          {STATE_META[s].label}
        </span>
      ))}
    </div>
  );
}

// ─── 編集ダイアログ ───────────────────────────────────────────────
function EditShiftDialog({
  userId,
  userName,
  date,
  existing,
  onClose,
  onSaved,
  onError,
}: {
  userId: string;
  userName: string;
  date: string;
  existing: StaffShift | null;
  onClose: () => void;
  onSaved: (msg: string) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [startTime, setStartTime] = useState(existing ? existing.start_time.slice(0, 5) : "09:00");
  const [endTime, setEndTime] = useState(existing ? existing.end_time.slice(0, 5) : "18:00");
  const [breakMinutes, setBreakMinutes] = useState(existing?.break_minutes ?? 60);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/staff-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          shift_date: date,
          start_time: startTime,
          end_time: endTime,
          break_minutes: breakMinutes,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? err.message ?? "保存に失敗しました");
      }
      await onSaved("シフトを保存しました");
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/staff-shifts?id=${existing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? "削除に失敗しました");
      }
      await onSaved("シフトを削除しました");
    } catch (e) {
      onError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-card w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-bold text-primary">シフト編集</div>
          <div className="mt-0.5 text-sm text-secondary">
            {userName} ・ {date}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-secondary">
            開始時刻
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="space-y-1 text-xs text-secondary">
            終了時刻
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs text-secondary">
          休憩 (分)
          <input
            type="number"
            min={0}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(Number(e.target.value))}
            className={`${inputCls} w-full`}
          />
        </label>

        <label className="block space-y-1 text-xs text-secondary">
          メモ
          <input
            type="text"
            value={notes}
            maxLength={200}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="任意 (例: 早番 / 遅番)"
            className={`${inputCls} w-full`}
          />
        </label>

        <div className="flex items-center justify-between pt-2">
          <div>
            {existing && (
              <button
                onClick={remove}
                disabled={saving}
                className="text-sm text-red-500 hover:underline disabled:opacity-40"
              >
                削除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              キャンセル
            </button>
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-40">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
