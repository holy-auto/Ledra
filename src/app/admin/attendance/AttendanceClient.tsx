"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";

// ─── 型定義 ──────────────────────────────────────────────────────
interface AttendanceRecord {
  id: string;
  user_id: string;
  staff_name: string | null;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  work_minutes: number | null;
  note: string | null;
}
interface AttendanceSummary {
  user_id: string;
  display_name: string;
  total_work_minutes: number;
  days_worked: number;
}
interface AttendanceResponse {
  ok: boolean;
  year: number;
  month: number;
  is_admin: boolean;
  caller_user_id: string;
  records: AttendanceRecord[];
  summary: AttendanceSummary[];
}

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${String(m).padStart(2, "0")}分`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" の日付部分 (DD) を数値で返す。 */
function dayOfMonth(workDate: string): number {
  return Number(workDate.slice(8, 10));
}

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

// ─── メインコンポーネント ─────────────────────────────────────────
type Tab = "mine" | "overview";

export default function AttendanceClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>("mine");
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editCell, setEditCell] = useState<{ userId: string; userName: string; workDate: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const isAdmin = data?.is_admin ?? false;
  const callerUserId = data?.caller_user_id ?? "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // overview タブのときは全スタッフ (user_id 省略)。mine タブは自分のみ。
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (tab === "mine" && callerUserId) params.set("user_id", callerUserId);
      const res = await fetch(`/api/admin/attendance?${params.toString()}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as AttendanceResponse;
      setData(json);
    } catch (e) {
      console.error(e);
      showToast("error", "勤怠データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [year, month, tab, callerUserId, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 月移動 ----------------------------------------------------------
  // React Compiler が自動メモ化するため手動 useCallback は使わない。
  function shiftMonth(delta: number) {
    setMonth((prevMonth) => {
      const next = prevMonth + delta;
      if (next < 1) {
        setYear((y) => y - 1);
        return 12;
      }
      if (next > 12) {
        setYear((y) => y + 1);
        return 1;
      }
      return next;
    });
  }

  // 自分の当日レコード ----------------------------------------------
  const today = todayString();
  const myToday = useMemo(() => {
    if (!data) return null;
    return data.records.find((r) => r.user_id === callerUserId && r.work_date === today) ?? null;
  }, [data, callerUserId, today]);

  const myRecords = useMemo(() => {
    if (!data) return [];
    return data.records
      .filter((r) => r.user_id === callerUserId)
      .sort((a, b) => a.work_date.localeCompare(b.work_date));
  }, [data, callerUserId]);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // 出勤打刻 --------------------------------------------------------
  // 状態セッタ (setBusy) を含むハンドラは React Compiler の自動メモ化に任せる。
  async function clockIn() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "clock-in failed");
      }
      showToast("success", "出勤を記録しました");
      await fetchData();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "出勤打刻に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // 退勤打刻 --------------------------------------------------------
  async function clockOut() {
    if (!myToday) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: myToday.id, break_minutes: myToday.break_minutes ?? 0 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "clock-out failed");
      }
      showToast("success", "退勤を記録しました");
      await fetchData();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "退勤打刻に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const monthLabel = `${year}年${month}月`;

  return (
    <div className="mx-auto max-w-[1600px] pb-20">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">勤怠管理</h1>
          <p className="mt-1 text-sm text-secondary">日次の出勤・退勤を記録し、月次の労働時間を集計します</p>
        </div>
        {/* 月セレクタ */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-lg border border-border-default bg-surface px-2.5 py-1.5 text-secondary transition-colors hover:bg-surface-hover"
            aria-label="前の月"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="min-w-[110px] text-center text-sm font-semibold text-primary">{monthLabel}</span>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-lg border border-border-default bg-surface px-2.5 py-1.5 text-secondary transition-colors hover:bg-surface-hover"
            aria-label="次の月"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* 打刻パネル */}
      <div className="glass-card mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl p-5">
        <div>
          <div className="text-xs text-muted">本日 {today}</div>
          <div className="mt-1 text-sm text-secondary">
            {myToday?.clock_in ? (
              myToday.clock_out ? (
                <span>
                  退勤済み・実働 <span className="font-semibold text-success">{formatHours(myToday.work_minutes)}</span>
                </span>
              ) : (
                <span>
                  出勤中・出勤 <span className="font-semibold text-accent">{formatTime(myToday.clock_in)}</span>
                </span>
              )
            ) : (
              <span className="text-muted">未出勤</span>
            )}
          </div>
        </div>
        <MutationGuard>
          <div className="flex items-center gap-3">
            <button
              onClick={clockIn}
              disabled={busy || !!myToday?.clock_in}
              className="rounded-xl bg-accent px-8 py-3 text-base font-bold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              出勤
            </button>
            <button
              onClick={clockOut}
              disabled={busy || !myToday?.clock_in || !!myToday?.clock_out}
              className="rounded-xl bg-surface-active px-8 py-3 text-base font-bold text-primary ring-1 ring-border-default transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              退勤
            </button>
          </div>
        </MutationGuard>
      </div>

      {/* タブ */}
      <div className="mb-4 flex items-center gap-1 border-b border-border-default">
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          自分の勤怠
        </TabButton>
        {isAdmin && (
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            スタッフ一覧
          </TabButton>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : tab === "mine" ? (
        <MyAttendanceTable records={myRecords} />
      ) : (
        <StaffOverview
          year={year}
          month={month}
          records={data?.records ?? []}
          summary={data?.summary ?? []}
          onEditCell={(userId, userName, workDate) => setEditCell({ userId, userName, workDate })}
        />
      )}

      {/* 管理者: セル編集ダイアログ */}
      {editCell && isAdmin && (
        <EditDialog
          userId={editCell.userId}
          userName={editCell.userName}
          workDate={editCell.workDate}
          existing={
            (data?.records ?? []).find((r) => r.user_id === editCell.userId && r.work_date === editCell.workDate) ??
            null
          }
          onClose={() => setEditCell(null)}
          onSaved={async () => {
            setEditCell(null);
            showToast("success", "勤怠を更新しました");
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

      {/* 当月以外の閲覧ヒント */}
      {!isCurrentMonth && tab === "mine" && (
        <p className="mt-4 text-center text-xs text-muted">過去/未来月を表示中です。打刻は本日分のみ可能です。</p>
      )}
    </div>
  );
}

// ─── タブボタン ───
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active ? "border-accent text-accent" : "border-transparent text-secondary hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

// ─── 自分の勤怠テーブル ───
function MyAttendanceTable({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="glass-card rounded-xl p-10 text-center text-sm text-muted">この月の勤怠記録はありません</div>
    );
  }
  const totalMinutes = records.reduce((s, r) => s + (r.work_minutes ?? 0), 0);

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">日付</th>
              <th className="px-4 py-3 font-medium">出勤</th>
              <th className="px-4 py-3 font-medium">退勤</th>
              <th className="px-4 py-3 font-medium">休憩</th>
              <th className="px-4 py-3 font-medium">実働</th>
              <th className="px-4 py-3 font-medium">メモ</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const d = new Date(`${r.work_date}T00:00:00`);
              const wd = Number.isNaN(d.getTime()) ? "" : WEEKDAY[d.getDay()];
              return (
                <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-primary">
                    {r.work_date}
                    <span className="ml-1.5 text-xs text-muted">({wd})</span>
                  </td>
                  <td className="px-4 py-2.5 text-secondary">{formatTime(r.clock_in)}</td>
                  <td className="px-4 py-2.5 text-secondary">{formatTime(r.clock_out)}</td>
                  <td className="px-4 py-2.5 text-secondary">{r.break_minutes}分</td>
                  <td className="px-4 py-2.5 font-semibold text-primary">{formatHours(r.work_minutes)}</td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-muted">{r.note ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-default bg-surface-hover">
              <td className="px-4 py-3 font-semibold text-primary" colSpan={4}>
                月間合計 ({records.filter((r) => r.clock_in).length} 日)
              </td>
              <td className="px-4 py-3 font-bold text-accent" colSpan={2}>
                {formatHours(totalMinutes)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── スタッフ一覧 (管理者) ───
function StaffOverview({
  year,
  month,
  records,
  summary,
  onEditCell,
}: {
  year: number;
  month: number;
  records: AttendanceRecord[];
  summary: AttendanceSummary[];
  onEditCell: (userId: string, userName: string, workDate: string) => void;
}) {
  const numDays = daysInMonth(year, month);
  const days = useMemo(() => Array.from({ length: numDays }, (_, i) => i + 1), [numDays]);

  // user_id -> day(1..31) -> record の索引を作る。
  const index = useMemo(() => {
    const map = new Map<string, Map<number, AttendanceRecord>>();
    for (const r of records) {
      const inner = map.get(r.user_id) ?? new Map<number, AttendanceRecord>();
      inner.set(dayOfMonth(r.work_date), r);
      map.set(r.user_id, inner);
    }
    return map;
  }, [records]);

  if (summary.length === 0) {
    return <div className="glass-card rounded-xl p-10 text-center text-sm text-muted">スタッフがいません</div>;
  }

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const workDateFor = (day: number) => `${year}-${pad2(month)}-${pad2(day)}`;

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border-default text-muted">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">スタッフ</th>
              {days.map((day) => {
                const dow = new Date(year, month - 1, day).getDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <th
                    key={day}
                    className={`px-1 py-2 text-center font-normal ${isWeekend ? "text-danger/70" : ""}`}
                    style={{ minWidth: 26 }}
                  >
                    {day}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-medium">合計</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => {
              const inner = index.get(s.user_id);
              return (
                <tr key={s.user_id} className="border-b border-border-subtle last:border-0">
                  <td className="sticky left-0 z-10 max-w-[140px] truncate bg-surface px-3 py-1.5 font-medium text-primary">
                    {s.display_name}
                  </td>
                  {days.map((day) => {
                    const rec = inner?.get(day);
                    const worked = !!rec?.clock_in;
                    const done = !!rec?.clock_out;
                    return (
                      <td key={day} className="px-0.5 py-1 text-center">
                        <MutationGuard>
                          <button
                            type="button"
                            onClick={() => onEditCell(s.user_id, s.display_name, workDateFor(day))}
                            title={
                              rec
                                ? `${formatTime(rec.clock_in)} - ${formatTime(rec.clock_out)} (${formatHours(rec.work_minutes)})`
                                : "未記録（クリックで追加）"
                            }
                            className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:ring-1 hover:ring-accent ${
                              done
                                ? "bg-success/20 text-success"
                                : worked
                                  ? "bg-accent/20 text-accent"
                                  : "text-muted/40 hover:bg-surface-hover"
                            }`}
                          >
                            {done ? "✓" : worked ? "・" : ""}
                          </button>
                        </MutationGuard>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-semibold text-primary">
                    {formatHours(s.total_work_minutes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-border-default px-4 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-success/20 text-success">✓</span>
          退勤済み
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-accent/20 text-accent">・</span>
          出勤中
        </span>
        <span>セルをクリックで編集</span>
      </div>
    </div>
  );
}

// ─── 管理者: セル編集ダイアログ ───
function EditDialog({
  userId,
  userName,
  workDate,
  existing,
  onClose,
  onSaved,
  onError,
}: {
  userId: string;
  userName: string;
  workDate: string;
  existing: AttendanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  // timestamptz -> "HH:mm" (datetime-local 用には日付も必要なので time のみ扱う)
  const toTimeValue = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const [clockInTime, setClockInTime] = useState(toTimeValue(existing?.clock_in ?? null));
  const [clockOutTime, setClockOutTime] = useState(toTimeValue(existing?.clock_out ?? null));
  const [breakMinutes, setBreakMinutes] = useState(String(existing?.break_minutes ?? 0));
  const [note, setNote] = useState(existing?.note ?? "");
  const [submitting, setSubmitting] = useState(false);

  // "HH:mm" + workDate -> ISO 文字列 (ローカルタイムで解釈)。空なら null。
  const toIso = (time: string): string | null => {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(`${workDate}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  async function submit() {
    const bm = Number(breakMinutes);
    if (!Number.isInteger(bm) || bm < 0) {
      onError("休憩時間は 0 以上の整数で入力してください。");
      return;
    }
    const clockInIso = toIso(clockInTime);
    const clockOutIso = toIso(clockOutTime);
    if (clockInIso && clockOutIso && new Date(clockOutIso) < new Date(clockInIso)) {
      onError("退勤時刻は出勤時刻より後にしてください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          work_date: workDate,
          clock_in: clockInIso,
          clock_out: clockOutIso,
          break_minutes: bm,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "update failed");
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="勤怠の編集" onClose={onClose}>
      <div className="mb-4 rounded-lg bg-surface-hover px-3 py-2 text-sm">
        <span className="font-semibold text-primary">{userName}</span>
        <span className="ml-2 text-muted">{workDate}</span>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="出勤時刻">
            <input
              type="time"
              value={clockInTime}
              onChange={(e) => setClockInTime(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="退勤時刻">
            <input
              type="time"
              value={clockOutTime}
              onChange={(e) => setClockOutTime(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>
        <Field label="休憩時間（分）">
          <input
            type="number"
            min={0}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </Field>
        <Field label="メモ（任意）">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="遅刻・早退・特記事項など"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>
      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="保存する" />
    </DialogShell>
  );
}

// ─── 共通ダイアログパーツ ───
function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-secondary">{label}</label>
      {children}
    </div>
  );
}

function DialogActions({
  onClose,
  onSubmit,
  submitting,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded-lg bg-inset px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? "処理中…" : submitLabel}
      </button>
    </div>
  );
}
